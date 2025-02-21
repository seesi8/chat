document.addEventListener("DOMContentLoaded", function () {
    let captureButton = document.querySelector("#capturePage");
    let title = document.querySelector("#title");
    let progressDisplay = document.createElement("p");
    progressDisplay.textContent = "Waiting for progress...";
    document.body.appendChild(progressDisplay);

    // Listen for progress updates from content.js
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === "update_progress") {
            progressDisplay.textContent = `Current Question: ${message.progress}`;
        }

        if (message.action === "capture_done") {
            captureButton.disabled = false; // Re-enable button after process completes
            captureButton.textContent = "Capture a Specific Div"; // Reset button text
            title.textContent = "Done"; // Change button text

        }
    });

    // Ensure popup only works on valid pages
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        let currentTab = tabs[0];
        let urlPattern = /^https:\/\/apclassroom\.collegeboard\.org\/1\/assessments\/results\/.*\/performance\/.*/;

        if (!urlPattern.test(currentTab.url)) {
            captureButton.disabled = true;
            progressDisplay.innerHTML = "Navigate to a valid question page. <strong> You must be viewing Q1 </strong>";
        }
    });

    // Capture button logic
    captureButton.addEventListener("click", function () {
        captureButton.disabled = true; // Disable button
        captureButton.textContent = "Processing photo..."; // Change button text
        title.textContent = "Processing photo... DO NOT LEAVE PAGE"; // Change button text

        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            let currentTab = tabs[0];

            if (currentTab) {
                chrome.tabs.sendMessage(currentTab.id, { action: "capture" });
            }
        });
    });
    
});
