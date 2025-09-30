<!DOCTYPE html>
<html lang="en">

<body>
    <h1>IP2Node <span class="badge">v1.0</span></h1>
    <p>
        <strong>GitHub:</strong> <a href="https://github.com/Riotcoke123/IP2Node" target="_blank">Riotcoke123/IP2Node</a><br>
        <strong>License:</strong> <span class="badge">GNU GPL 3.0</span>
    </p>
    <h2>🚀 Overview</h2>
    <p>
        <strong>IP2Node</strong> is a Node.js application that automatically fetches posts from Communities.win APIs, identifies new media content, uploads supported files to FileDitch, and maintains a local JSON database. It runs continuously as a background processor and also provides an Express-based web interface for monitoring and manual triggers.
    </p>
    <h2>✨ Features</h2>
    <ul>
        <li>Fetch posts from multiple community APIs.</li>
        <li>Detect new posts containing images or videos (<code>.mp4, .jpg, .jpeg, .gif, .png, .webp</code>).</li>
        <li>Automatic media upload to FileDitch.</li>
        <li>Atomic read/write to JSON using <code>async-mutex</code> for thread-safe operations.</li>
        <li>Express server endpoints:
            <ul>
                <li><code>/</code> - Dashboard view of processed items.</li>
                <li><code>/process</code> - Manually trigger a processing cycle.</li>
                <li><code>/data</code> - Retrieve raw JSON data.</li>
            </ul>
        </li>
        <li>Configurable via environment variables for API keys, URLs, and server settings.</li>
    </ul>
    <h2>⚡ Installation</h2>
    <pre><code>git clone https://github.com/Riotcoke123/ip2Node.git
cd ip2Node
npm install
</code></pre>
    <h2>🛠 Environment Variables</h2>
    <p>Create a <code>.env</code> file in the project root with the following:</p>
    <pre><code>CW_API_KEY=your_api_key
CW_API_SECRET=your_api_secret
CW_XSRF_TOKEN=your_xsrf_token
CW_API_URLS=https://communities.win/api/v2/post/newv2.json?community=ip2always,https://communities.win/api/v2/post/newv2.json?community=spictank
APP_FILEDITCH_URL=https://up1.fileditch.com/upload.php
APP_DATA_FILE_PATH=data.json
APP_HOST=0.0.0.0
APP_PORT=5000
PROCESSING_INTERVAL_SECONDS=120
REQUEST_TIMEOUT=30
UPLOAD_TIMEOUT=300
</code></pre>
    <h2>📦 Usage</h2>
    <pre><code>node index.js
</code></pre>
    <p>
        The server will start, initiate a background processing thread, and periodically fetch new posts. Use POST <code>/process</code> to manually trigger processing, or GET <code>/data</code> to view JSON data.
    </p>
    <h2>💡 Code Highlights</h2>
    <ul>
        <li><code>axios</code> for HTTP requests.</li>
        <li>Thread-safe JSON data management using <code>async-mutex</code>.</li>
        <li>Automatic media detection and uploading.</li>
        <li>Detailed UTC timestamped logging for all operations.</li>
    </ul>
    <h2>🔮 Future Updates</h2>
    <ul>
        <li>Support for alternative video hosting platforms such as:
            <ul>
                <li><a href="https://pomf2.lain.la/" target="_blank">Pomf2</a></li>
                <li><a href="https://catbox.moe/" target="_blank">Catbox</a></li>
            </ul>
        </li>
        <li>Optional user-selectable upload destination per post.</li>
        <li>Enhanced UI for better media preview and management.</li>
        <li>Extended support for additional media formats beyond current images and MP4 videos.</li>
        <li>Improved error handling and retry mechanisms for uploads and API fetches.</li>
    </ul>
    <h2>📜 License</h2>
    <blockquote>
        This project is licensed under the <strong>GNU General Public License v3.0</strong>. See <a href="https://www.gnu.org/licenses/gpl-3.0.en.html" target="_blank">GPL-3.0 License</a> for details.
    </blockquote>
    <h2>💻 Support & Contributions</h2>
    <p>Contributions, bug reports, and suggestions are welcome! Feel free to open an issue or submit a pull request on the <a href="https://github.com/Riotcoke123/IP2Node" target="_blank">GitHub repository</a>.</p>
</body>
</html>
