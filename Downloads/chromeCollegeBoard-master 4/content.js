console.log("✅ Screen Capture Extension Script has loaded");
let capturedImages = []; // Stores all captured images

// Function to extract the current progress
function getCurrentProgress() {
  let progressElement = document.querySelector(
    '.RI_header__title'
  );


  if (progressElement) {
    let progressText = progressElement.textContent.split(" ")[0]; // Example: "13/16"
    chrome.runtime.sendMessage({
      action: "update_progress",
      progress: progressText,
    });
  }
}

// Run the function when the page loads
getCurrentProgress();

// Listen for page updates (optional, to detect dynamic changes)
new MutationObserver(getCurrentProgress).observe(document.body, {
  childList: true,
  subtree: true,
});

// Listen to messages sent by the background script
chrome.runtime.onMessage.addListener(ScreenCaptureExtCB);
function ScreenCaptureExtCB(msg) {
  console.log("📩 Message received:", msg);

  if (msg.action == "done") {
    console.log("🖼 Merging images...");
    mergeImagesVertically(capturedImages).then((finalImage) => {
      downloadImage(finalImage);

      chrome.runtime.sendMessage({ action: "capture_done" });

      console.log("✅ Final merged screenshot downloaded!");
    });
    return;
  }

  if (msg.action === "capture") {
    const targetElement = document.querySelector(".PerformanceItem");

    if (!targetElement) {
      console.warn("❌ No element found with class .PerformanceItem");
      return;
    }

    const headerChildren = Array.from(
      targetElement.querySelector(".RI_header").children
    );
    console.log(headerChildren);
    if (headerChildren) {
      headerChildren.forEach((item, i) => {
        if (
          !(
            item.classList.contains("RI_header__title__nolin") ||
            item.classList.contains("RI_header__performance_box")
          )
        ) {
          item.remove();
        }
      });
    }

    modifySelected(targetElement);

    // Replace external images with base64
    replaceExternalImagesWithBase64(targetElement)
      .then(() => {
        console.log("📸 All images processed, capturing screenshot...");
        html2canvas(targetElement, { useCORS: true }).then((canvas) => {
          const imageUrl = canvas.toDataURL("image/png");
          capturedImages.push(imageUrl);



          console.log("✅ Screenshot captured!");

          // If this is the last screenshot, merge them
          //msg.lastCapture
          if (msg.lastCapture) {
          } else {
            // Send success message to trigger next capture
            chrome.runtime.sendMessage({
              action: "capture_success",
              message: "Screenshot captured successfully!",
            });
          }
        });
      })
      .catch((err) => {
        console.error("❌ Error processing images:", err);
      });
  }
}

// Function to merge captured images vertically
async function mergeImagesVertically(imageUrls) {
  const images = await Promise.all(imageUrls.map(loadImage));
  const maxWidth = Math.max(...images.map((img) => img.width));
  const totalHeight = images.reduce((sum, img) => sum + img.height, 0);

  const canvas = document.createElement("canvas");
  canvas.width = maxWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext("2d");

  let yOffset = 0;
  images.forEach((img) => {
    const scale = maxWidth / img.width;
    const newHeight = img.height * scale;
    ctx.drawImage(img, 0, yOffset, maxWidth, newHeight);
    yOffset += newHeight;
  });

  return canvas.toDataURL("image/png");
}

// Helper function to load an image
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Function to download the merged image
function downloadImage(imageDataUrl) {
  const link = document.createElement("a");
  link.href = imageDataUrl;
  link.download = `merged_screenshot_${Date.now()}.png`; // Unique file name
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
// Convert external images to base64 with a 500ms timeout
async function replaceExternalImagesWithBase64(element) {
  const images = element.getElementsByTagName("img");
  const imagePromises = Array.from(images).map(async (img) => {
    if (!img.src.startsWith("data:")) {
      // Ignore if already base64
      try {
        const base64 = await fetchImageWithTimeout(img.src, 500);
        if (base64) {
          img.setAttribute("src", base64);
        }
      } catch (err) {
        console.warn(`⚠ Skipping image due to timeout: ${img.src}`, err);
      }
    }
  });
  return Promise.all(imagePromises);
}

function modifySelected() {
  findAllVisibleTeacherItems().forEach((element) => {
    transformOption(element);
  });
}

function transformOption(option) {
  if (!option) return;

  let letter = option.querySelector(".letter");
  let responseIcon = option.querySelector(".icon");

  // Case 1: Selected but Incorrect → Make it Unselected
  if (
    option.classList.contains("--incorrect") &&
    letter.classList.contains("--chosen")
  ) {
    console.log("Transforming: Selected & Incorrect → Unselected");

    // Remove selection and incorrect styles
    letter.classList.remove("--chosen");
    option.classList.remove("--incorrect");
    if (responseIcon) responseIcon.classList.remove("--incorrect");
  }

  // Case 2: Unselected but Correct → Make it Selected
  else if (
    responseIcon.classList.contains("--correct") &&
    !letter.classList.contains("--chosen")
  ) {
    console.log("Transforming: Unselected & Correct → Selected & Correct");

    // Add selection styling
    letter.classList.add("--chosen");
    option.classList.add("--correct");
  }
  console.log(option);
}

function findAllVisibleTeacherItems() {
  const elements = document.querySelectorAll(".teacher-item-preview");

  const element = Array.from(elements).filter((element) => {
    const style = window.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      element.offsetWidth > 0 &&
      element.offsetHeight > 0
    );
  })[0];

  if (element.querySelector(".LearnosityDistractor")) {
    element.querySelector(".LearnosityDistractor").remove();
  }

  return element.querySelectorAll(".mcq-option");
}

// Fetch image and convert to base64 with a 500ms timeout
async function fetchImageWithTimeout(url, timeout = 500) {
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(
      url
    )}`;

    const fetchPromise = fetch(proxyUrl).then((response) => response.blob());

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject("Timeout"), timeout)
    );

    const blob = await Promise.race([fetchPromise, timeoutPromise]);

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("❌ Failed to fetch image via proxy:", error);
    return null; // Return null to allow execution to continue
  }
}
