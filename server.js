const os = require('os');
const fs = require('fs').promises;
const path = require('path');
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const mime = require('mime-types');
const { URL } = require('url');
const { Mutex } = require('async-mutex'); // Import the new library

// Load environment variables from .env file
require('dotenv').config();

// --- Configuration ---
const {
    CW_API_KEY,
    CW_API_SECRET,
    CW_XSRF_TOKEN,
    CW_API_URLS,
    APP_FILEDITCH_URL,
    APP_DATA_FILE_PATH,
    APP_HOST,
    APP_PORT,
    PROCESSING_INTERVAL_SECONDS,
    REQUEST_TIMEOUT,
    UPLOAD_TIMEOUT
} = process.env;

const DEFAULT_CW_API_URLS = [
    "https://communities.win/api/v2/post/newv2.json?community=ip2always",
    "https://communities.win/api/v2/post/newv2.json?community=spictank"
];

const COMMUNITIES_API_URLS = CW_API_URLS ? CW_API_URLS.split(',').map(url => url.trim()).filter(Boolean) : DEFAULT_CW_API_URLS;
const FILEDITCH_UPLOAD_URL = APP_FILEDITCH_URL || "https://up1.fileditch.com/upload.php";
const DATA_FILE_PATH = path.resolve(APP_DATA_FILE_PATH || 'data.json');
const HOST = APP_HOST || '0.0.0.0';
const PORT = parseInt(APP_PORT || '5000', 10);
const INTERVAL_SECONDS = parseInt(PROCESSING_INTERVAL_SECONDS || '120', 10);
const REQ_TIMEOUT_MS = parseInt(REQUEST_TIMEOUT || '30', 10) * 1000;
const UPLOAD_TIMEOUT_MS = parseInt(UPLOAD_TIMEOUT || '300', 10) * 1000;

const SUPPORTED_VIDEO_EXTENSIONS = new Set(['.mp4']);
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.gif', '.png', '.webp']);
const SUPPORTED_EXTENSIONS = new Set([...SUPPORTED_VIDEO_EXTENSIONS, ...SUPPORTED_IMAGE_EXTENSIONS]);

// Simple console logger with UTC timestamps
const log = (level, message) => {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} - ${level.toUpperCase()} - ${message}`);
};

// --- API Headers & Validation ---
if (!CW_API_KEY || !CW_API_SECRET || !CW_XSRF_TOKEN) {
    log('critical', 'Missing required environment variables: CW_API_KEY, CW_API_SECRET, or CW_XSRF_TOKEN. Please set them and restart. Exiting.');
    process.exit(1);
}

const COMMUNITIES_HEADERS = {
    'accept': 'application/json, text/plain, */*',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    'x-api-key': CW_API_KEY,
    'x-api-secret': CW_API_SECRET,
    'x-xsrf-token': CW_XSRF_TOKEN,
    'x-api-platform': 'Scored-Desktop',
    'sec-fetch-site': 'same-origin',
};

// --- Data Handling with Atomic Writes & Mutex Lock ---
const dataMutex = new Mutex(); // Create the lock
let isProcessing = false;

const loadData = async (filepath) => {
    const release = await dataMutex.acquire(); // Acquire lock before reading
    try {
        await fs.mkdir(path.dirname(filepath), { recursive: true });
        const content = await fs.readFile(filepath, 'utf-8');
        if (!content.trim()) {
            log('info', `Data file ${filepath} is empty. Starting fresh.`);
            return [];
        }
        const data = JSON.parse(content);
        if (!Array.isArray(data)) {
            log('error', `Data in ${filepath} is not an array. Starting fresh.`);
            return [];
        }
        log('info', `Successfully loaded ${data.length} items from ${filepath}`);
        return data;
    } catch (error) {
        if (error.code === 'ENOENT') {
            log('info', `Data file ${filepath} not found. Starting fresh.`);
        } else {
            log('error', `Error loading data from ${filepath}: ${error.message}`);
        }
        return [];
    } finally {
        release(); // Always release the lock
    }
};

const saveData = async (filepath, data) => {
    const tempFilepath = `${filepath}.tmp`;
    const release = await dataMutex.acquire(); // Acquire lock before writing
    try {
        await fs.mkdir(path.dirname(filepath), { recursive: true });
        await fs.writeFile(tempFilepath, JSON.stringify(data, null, 4), 'utf-8');
        await fs.rename(tempFilepath, filepath); // Atomic operation
        log('info', `Data successfully saved to ${filepath} (${data.length} items)`);
    } catch (error) {
        log('error', `Error saving data to ${filepath}: ${error.message}`);
        try {
            await fs.unlink(tempFilepath);
        } catch (cleanupError) {
            // Ignore
        }
    } finally {
        release(); // Always release the lock
    }
};


// --- Core Logic ---

const fetchCommunitiesData = async (apiUrl) => {
    log('info', `Attempting to fetch data from: ${apiUrl}`);
    try {
        const response = await axios.get(apiUrl, {
            headers: COMMUNITIES_HEADERS,
            timeout: REQ_TIMEOUT_MS,
        });
        log('debug', `Successfully decoded JSON from ${apiUrl}`);
        return response.data;
    } catch (error) {
        if (error.response) {
            const { status, data } = error.response;
            log('error', `HTTP error for ${apiUrl}: ${status}. Response: ${JSON.stringify(data).substring(0, 200)}...`);
            if ([401, 403].includes(status)) {
                log('error', "Received 401/403 Unauthorized/Forbidden error. Check API credentials.");
            }
        } else if (error.code === 'ECONNABORTED') {
            log('error', `Timeout fetching data from ${apiUrl} after ${REQ_TIMEOUT_MS / 1000}s.`);
        } else {
            log('error', `Generic network error fetching data from ${apiUrl}: ${error.message}`);
        }
        return null;
    }
};

const uploadToFileDitch = async (fileUrl) => {
    log('info', `Attempting to download: ${fileUrl}`);
    try {
        const downloadResponse = await axios.get(fileUrl, {
            responseType: 'stream',
            timeout: REQ_TIMEOUT_MS,
            headers: { 'User-Agent': COMMUNITIES_HEADERS['user-agent'] }
        });

        const parsedUrl = new URL(fileUrl);
        const filename = path.basename(parsedUrl.pathname);
        const mimeType = mime.lookup(filename) || 'application/octet-stream';

        const form = new FormData();
        form.append('files[]', downloadResponse.data, {
            filename: filename,
            contentType: mimeType,
        });

        log('info', `Uploading '${filename}' (from ${fileUrl}) to ${FILEDITCH_UPLOAD_URL}...`);
        const uploadResponse = await axios.post(FILEDITCH_UPLOAD_URL, form, {
            headers: form.getHeaders(),
            timeout: UPLOAD_TIMEOUT_MS,
        });

        const uploadData = uploadResponse.data;
        if (uploadData.success && uploadData.files && uploadData.files.length > 0) {
            const fileditchLink = uploadData.files[0].url;
            log('info', `Successfully uploaded to FileDitch: ${fileditchLink}`);
            return fileditchLink;
        } else {
            log('error', `FileDitch upload failed. Response: ${JSON.stringify(uploadData)}`);
            return null;
        }
    } catch (error) {
        log('error', `An error occurred during upload processing for ${fileUrl}: ${error.message}`);
        return null;
    }
};

const runProcessingCycle = async () => {
    if (isProcessing) {
        log('warn', 'Processing cycle already in progress. Skipping.');
        return { message: "Processing already in progress.", new_items_added: 0, total_items_in_file: 0, posts_checked_this_cycle: 0 };
    }
    isProcessing = true;
    log('info', 'Starting processing cycle...');

    let new_items_added = 0;
    let posts_checked_this_cycle = 0;

    try {
        const existing_data = await loadData(DATA_FILE_PATH);
        const existing_post_ids = new Set(existing_data.map(item => `${item.title.trim()}|${item.author.trim()}`));
        log('info', `Initialized duplicate check set with ${existing_post_ids.size} existing posts.`);

        const fetchPromises = COMMUNITIES_API_URLS.map(fetchCommunitiesData);
        const results = await Promise.all(fetchPromises);

        let all_posts_from_apis = [];
        results.forEach(data => {
            if (!data) return;
            let posts_list = null;
            if (Array.isArray(data)) {
                posts_list = data;
            } else if (typeof data === 'object') {
                const possible_keys = ['posts', 'data', 'items', 'results', 'threads', 'newPosts', 'hotPosts'];
                for (const key of possible_keys) {
                    if (Array.isArray(data[key])) {
                        posts_list = data[key];
                        break;
                    }
                }
            }
            if (posts_list) {
                all_posts_from_apis.push(...posts_list);
            }
        });

        log('info', `Total valid posts fetched across all APIs: ${all_posts_from_apis.length}. Processing...`);

        const items_to_add = [];
        for (const post of all_posts_from_apis) {
            posts_checked_this_cycle++;
            const { author, title, link } = post;

            if (!author || !title || !link || typeof link !== 'string') continue;
            
            try {
                const extension = path.extname(new URL(link).pathname).toLowerCase();
                if (SUPPORTED_EXTENSIONS.has(extension)) {
                    const postId = `${title.trim()}|${author.trim()}`;
                    if (existing_post_ids.has(postId)) continue;

                    log('info', `Found new post: Title='${title}', Author='${author}', Link='${link}'`);
                    const fileditch_link = await uploadToFileDitch(link);

                    if (fileditch_link) {
                        const newEntry = {
                            title: title.trim(),
                            author: author.trim(),
                            fileditch_link,
                            original_link: link,
                            type: SUPPORTED_VIDEO_EXTENSIONS.has(extension) ? "video" : "image"
                        };
                        items_to_add.push(newEntry);
                        existing_post_ids.add(postId);
                        new_items_added++;
                    }
                }
            } catch (e) {
                // Ignore invalid URLs
            }
        }
        
        if (new_items_added > 0) {
            const updated_data = [...existing_data, ...items_to_add];
            await saveData(DATA_FILE_PATH, updated_data);
        } else {
            log('info', 'No new supported media posts found. Data file not modified.');
        }

        const total_items_in_file = existing_data.length + new_items_added;
        return { success: true, new_items_added, total_items_in_file, posts_checked_this_cycle };

    } catch (error) {
        log('error', `!!! Unhandled exception in processing cycle: ${error.message} !!!`);
        return { success: false, new_items_added: 0, total_items_in_file: 0, posts_checked_this_cycle: 0 };
    } finally {
        isProcessing = false; // Release lock
        log('info', 'Processing cycle finished.');
    }
};

// --- Express App Setup ---
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'static')));

// --- Routes ---
app.get('/', async (req, res) => {
    try {
        const items = await loadData(DATA_FILE_PATH);
        res.render('index', { items: items.slice().reverse(), item_count: items.length });
    } catch (error) {
        // This catch block is now a failsafe, as loadData handles its own errors.
        log('error', `Critical error in '/' route handler: ${error.message}`);
        res.status(500).send("Error loading data.");
    }
});

app.post('/process', async (req, res) => {
    log('info', "Manual processing request received via /process endpoint...");
    const result = await runProcessingCycle();
    if (result.success) {
        res.status(200).json({
            message: "Processing complete.",
            ...result
        });
    } else {
        res.status(500).json({
            message: "Processing cycle finished with errors (check server logs).",
            ...result
        });
    }
});

app.get('/data', async (req, res) => {
    try {
        const data = await loadData(DATA_FILE_PATH);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: "Failed to load data." });
    }
});

// --- Main Execution ---
const startServer = async () => {
    // Initial check to create data directory
    await fs.mkdir(path.dirname(DATA_FILE_PATH), { recursive: true });

    // Start background processor
    log('info', 'Background processing thread initiated.');
    setInterval(() => {
        log('info', 'Background thread waking up for processing cycle.');
        runProcessingCycle();
    }, INTERVAL_SECONDS * 1000);
    
    // Initial run on startup
    runProcessingCycle(); 

    // Start server
    app.listen(PORT, HOST, () => {
        log('info', `Starting Express server on http://${HOST}:${PORT}`);
    });
};

startServer().catch(err => log('critical', `Failed to start server: ${err.message}`));