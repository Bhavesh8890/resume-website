document.getElementById("scrapeBtn").addEventListener("click", () => {
    const statusDiv = document.getElementById("status");
    statusDiv.textContent = "Scanning page...";
    statusDiv.style.color = "#fbbf24"; // yellow

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0] || !tabs[0].id) {
            statusDiv.textContent = "Error: No active tab.";
            return;
        }

        chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            function: scrapeContent
        }, (results) => {
            if (chrome.runtime.lastError) {
                statusDiv.textContent = "Error: " + chrome.runtime.lastError.message;
                statusDiv.style.color = "#f87171";
                return;
            }
            if (!results || !results[0] || !results[0].result) {
                statusDiv.textContent = "❌ No Job Description detected.";
                statusDiv.style.color = "#f87171";
                return;
            }

            const jd = results[0].result;

            // Copy to clipboard
            navigator.clipboard.writeText(jd).then(() => {
                statusDiv.textContent = "✅ Copied to Clipboard!";
                statusDiv.style.color = "#4ade80"; // green
                setTimeout(() => {
                    statusDiv.textContent = "Paste it into the Resume Builder.";
                    statusDiv.style.color = "#cbd5e1";
                }, 2000);
            }).catch(err => {
                statusDiv.textContent = "Error copying: " + err;
            });
        });
    });
});

// This runs inside the page
function scrapeContent() {
    try {
        const selectors = [
            "#jobDescriptionText", // Indeed
            ".jobs-description__content", // LinkedIn
            ".jobs-description-content__text", // LinkedIn
            ".show-more-less-html__markup", // LinkedIn
            "[class*='description']", // Generic
            "[id*='description']",
            "article",
            "main"
        ];

        for (let sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.innerText.trim().length > 100) {
                return el.innerText.trim();
            }
        }
        return null;
    } catch (e) {
        return null;
    }
}
