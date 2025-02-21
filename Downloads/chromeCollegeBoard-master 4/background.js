function attachDebugger(tabId) {
    chrome.debugger.attach({ tabId }, "1.3", function () {
        chrome.debugger.sendCommand({ tabId }, "Network.enable");
    });

    chrome.debugger.onEvent.addListener(function (source, method, params) {
        // Capture request headers
        if (method === "Network.requestWillBeSent") {
            if (params.request.headers.hasOwnProperty("Authorization")) {
                const auth = {
                    url: params.request.url,
                    Authorization: params.request.headers["Authorization"],
                };

                console.log(auth);

                if (
                    auth["url"].includes(
                        "https://apc-api-production.collegeboard.org/fym/assessments"
                    )
                ) {
                    fetchAPI(auth, tabId);
                }
            }
        }
    });
}

async function fetchAPI(auth, tabId) {
    try {
        console.log({
            url: auth["url"],
            Authorization: auth["Authorization"],
        });
        const response = await fetch(
            "https://collegeboardbackend.vercel.app/fetch-api",

            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    url: auth["url"],
                    Authorization: auth["Authorization"],
                }),
            }
        );

        if (!response.ok)
            throw new Error(`HTTP error! Status: ${response.status}`);

        const data = (await response.json())["data"];
        const assignments = data["assignments"];
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: updateAssignmentsOnPage,
            args: [assignments],
        });
    } catch (error) {
        console.error("🚨 Error fetching API:", error);
    }
}

// Attach debugger when a new tab is opened
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete") {
        attachDebugger(tabId);
    }
});

// Function to update the page (defined here for execution in content script context)
function updateAssignmentsOnPage(assignments) {
    assignments.forEach((assignment) => {
        const selector = `tr[aria-label="${assignment.title}"]`;
        const row = document.querySelector(selector);

        if (row) {
            console.log(`✅ Found row for: ${assignment.title}`);
            row.classList.add("hover:bg-blue-100", "cursor-pointer");

            // Update the first child element with dueDate
            let dueDateElement = row.lastElementChild; // Assuming dueDate goes in the first `<td>`

            if (!dueDateElement) {
                console.warn(`⚠ No child <td> found for: ${assignment.title}`);
                return;
            }

            // Define the URL to redirect to (Modify as needed)
            const redirectUrl = `https://apclassroom.collegeboard.org/1/assessments/results/${assignment.id}/performance`;

            // Add an onclick event listener to <tr> to redirect
            row.onclick = function () {
                window.location.href = redirectUrl; // Redirect in the same tab
                // window.open(redirectUrl, "_blank"); // Uncomment to open in a new tab
            };

            console.log(assignment);

            dueDateElement.innerHTML = `
      <div class="flex items-center">
          <div data-test-loading="true" class="StudentPerformanceBar performanceBarMinWidth-hu9Fv"
              id="student-performance-bar-${
                  assignment.title
              }" role="figure" tabindex="-1"
              aria-label="${assignment.score} points out of ${
                assignment.max_score
            } points, achieving. Teacher Scored.">
              <div class="StudentPerformanceBar-barContainer">
                  <span class="yellow tier-bar" style="width: 25%;"></span>
                  <span class="light-yellow tier-bar" style="width: 25%;"></span>
                  <span class="light-green tier-bar" style="width: 25%;"></span>
                  <span class="green tier-bar" style="width: 25%;"></span>
              </div>
              <div class="content-container">
                  <div class="content content__right">
                      <span data-test-score-number="true" class="dark performance-score">${
                          assignment.score
                      }/${assignment.max_score}</span>
                  </div>
                  <div data-test-score-line="true" class="percentage-line percentage-line__right" style="margin-right: ${
                      100 -
                      parseInt((assignment.score / assignment.max_score) * 100)
                  }%;">
                  </div>
              </div>
          </div>
          <span></span>
      </div>`;
        } else {
            console.warn(`❌ No matching row found for: ${assignment.title}`);
        }
    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "capture_success") {
        console.log("✅ Screenshot captured and downloaded!");

        // Get the active tab and execute the click simulation script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length === 0) return;

            chrome.scripting
                .executeScript({
                    target: { tabId: tabs[0].id },
                    func: simulateClickOnNextResponse,
                })
                .then((results) => {
                    const nextExists = results[0].result; // Result from the script

                    if (nextExists) {
                        console.log("🔄 Waiting for new page to load...");

                        // Wait for the page to load before sending "capture" again
                        setTimeout(() => {
                            console.log(
                                "📸 Sending 'capture' message again..."
                            );
                            chrome.tabs.sendMessage(tabs[0].id, {
                                action: "capture",
                            });
                        }, 100); // Adjust delay based on page load speed
                    } else {
                        chrome.tabs.sendMessage(tabs[0].id, { action: "done" });
                        console.log(
                            "🏁 No more 'Next response' buttons. Stopping the loop."
                        );
                    }
                });
        });
    }
});

// Function to find the "Next response" link, simulate a click, and return whether it exists
function simulateClickOnNextResponse() {
    const nextLink = document.querySelector('a[aria-label="Next response"]');

    if (nextLink) {
        console.log("🖱 Simulating click on:", nextLink.href);
        nextLink.click(); // Simulate a user click event
        return true; // Indicates that the button exists
    } else {
        console.warn("❌ No 'Next response' link found! Ending loop.");
        return false; // Indicates that the button does NOT exist
    }
}
