/**
 * Website Highlight Saver - Content Script
 * Handles text selection and highlight saving on web pages
 */

// Global variables to track state
let currentSelection = null
let isProcessingHighlight = false

/**
 * Creates the popup element that appears when text is selected
 * @returns {HTMLElement} The popup DOM element
 */
function createSelectionPopup() {
  try {
    // Check if popup already exists
    let popup = document.getElementById("highlight-saver-popup")
    if (popup) return popup

    // Create new popup with improved UI
    popup = document.createElement("div")
    popup.id = "highlight-saver-popup"
    popup.className = "highlight-saver-popup"
    popup.innerHTML = `
      <button id="save-highlight-btn">
        <span class="icon">💾</span>Save Highlight
      </button>
    `

    // Add click handler for the save button
    popup
      .querySelector("#save-highlight-btn")
      .addEventListener("click", function (e) {
        e.preventDefault()
        e.stopPropagation()
        if (!isProcessingHighlight) {
          saveHighlight()
        }
      })

    document.body.appendChild(popup)
    return popup
  } catch (error) {
    console.error("Highlight Saver: Error creating selection popup:", error)
    // Create a simpler version as fallback
    const fallbackPopup = document.createElement("div")
    fallbackPopup.id = "highlight-saver-popup"
    fallbackPopup.className = "highlight-saver-popup"
    fallbackPopup.innerHTML = '<button id="save-highlight-btn">Save</button>'
    document.body.appendChild(fallbackPopup)
    return fallbackPopup
  }
}

/**
 * Shows a notification after highlight is saved
 * @param {string} message - Message to display in notification
 */
function showNotification(message) {
  try {
    const notification = document.createElement("div")
    notification.className = "highlight-save-notification"
    notification.textContent = message
    document.body.appendChild(notification)

    // Auto remove after animation completes
    setTimeout(() => {
      if (notification && notification.parentNode) {
        notification.parentNode.removeChild(notification)
      }
    }, 3500)
  } catch (error) {
    console.error("Highlight Saver: Error showing notification:", error)
  }
}

/**
 * Saves the currently selected text as a highlight
 */
function saveHighlight() {
  try {
    if (!currentSelection || currentSelection.toString().trim() === "") {
      console.warn("Highlight Saver: No text selected to save")
      return
    }

    isProcessingHighlight = true

    const highlightText = currentSelection.toString().trim()

    // Don't save if text is too long (100,000 chars limit)
    if (highlightText.length > 100000) {
      showNotification("Error: Selected text is too long")
      isProcessingHighlight = false
      return
    }

    const highlight = {
      id: "highlight_" + Date.now(),
      text: highlightText,
      url: window.location.href,
      title: document.title || "Unknown page",
      timestamp: new Date().toISOString(),
    }

    // Send to background script for storage
    chrome.runtime.sendMessage(
      {
        action: "saveHighlight",
        highlight: highlight,
      },
      (response) => {
        if (response && response.success) {
          visuallyHighlightText()
          showNotification("✓ Highlight saved")
        } else {
          showNotification("❌ Error saving highlight")
          console.error(
            "Highlight Saver: Error saving highlight:",
            response ? response.error : "Unknown error"
          )
        }
        isProcessingHighlight = false
      }
    )

    // Handle case where response doesn't come back
    setTimeout(() => {
      if (isProcessingHighlight) {
        isProcessingHighlight = false
      }
    }, 5000)
  } catch (error) {
    console.error("Highlight Saver: Error saving highlight:", error)
    showNotification("❌ Error saving highlight")
    isProcessingHighlight = false
  }

  hideSelectionPopup()
}

/**
 * Visually highlights the selected text on the page
 */
function visuallyHighlightText() {
  try {
    if (!currentSelection) return

    // Get all ranges in the selection
    const ranges = []
    for (let i = 0; i < currentSelection.rangeCount; i++) {
      ranges.push(currentSelection.getRangeAt(i))
    }

    // Apply highlighting to each range
    ranges.forEach((range) => {
      if (range.collapsed) return

      const span = document.createElement("span")
      span.className = "website-highlight-saver-highlight"

      try {
        range.surroundContents(span)
      } catch (e) {
        // Complex selections (spanning multiple elements) can't use surroundContents
        // This is a known DOM limitation, we'll just log it
        console.warn(
          "Highlight Saver: Could not apply visual highlight to complex selection:",
          e
        )
      }
    })
  } catch (e) {
    console.warn("Highlight Saver: Could not highlight selection:", e)
  }
}

/**
 * Shows the popup near text selection
 * @param {Selection} selection - The user's text selection
 */
function showSelectionPopup(selection) {
  try {
    // Prevent showing for tiny selections (like accidental clicks)
    if (selection.toString().trim().length < 2) return

    const popup = createSelectionPopup()

    // Get selection coordinates
    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()

    // Position the popup
    const popupHeight = 40 // Estimated height
    let top = rect.bottom + window.scrollY + 10

    // Check if popup would go off bottom of viewport
    if (top + popupHeight > window.innerHeight + window.scrollY) {
      top = rect.top + window.scrollY - popupHeight - 10
    }

    // Center the popup under the selection
    let left = rect.left + rect.width / 2 - 70 + window.scrollX

    // Keep popup within viewport width
    const viewportWidth = window.innerWidth
    if (left < 10) left = 10
    if (left > viewportWidth - 140) left = viewportWidth - 140

    popup.style.left = `${left}px`
    popup.style.top = `${top}px`
    popup.style.display = "block"

    // Store current selection
    currentSelection = selection
  } catch (error) {
    console.error("Highlight Saver: Error showing selection popup:", error)
  }
}

/**
 * Hides the popup
 */
function hideSelectionPopup() {
  try {
    const popup = document.getElementById("highlight-saver-popup")
    if (popup) {
      popup.style.display = "none"
    }
    currentSelection = null
  } catch (error) {
    console.error("Highlight Saver: Error hiding selection popup:", error)
  }
}

/**
 * Initializes event listeners for the content script
 */
function initializeContentScript() {
  try {
    // Listen for text selection
    document.addEventListener("mouseup", function (e) {
      // Ignore if we're clicking within our own UI
      if (
        e.target.id === "highlight-saver-popup" ||
        e.target.closest("#highlight-saver-popup")
      ) {
        return
      }

      const selection = window.getSelection()

      // Check if we have selected text
      if (selection && selection.toString().trim() !== "") {
        showSelectionPopup(selection)
      } else {
        hideSelectionPopup()
      }
    })

    // Hide popup when clicking elsewhere
    document.addEventListener("mousedown", function (e) {
      if (
        e.target.id !== "highlight-saver-popup" &&
        !e.target.closest("#highlight-saver-popup")
      ) {
        hideSelectionPopup()
      }
    })

    // Handle keyboard navigation
    document.addEventListener("keydown", function (e) {
      // ESC key
      if (e.key === "Escape") {
        hideSelectionPopup()
      }

      // Enter key with selection and popup visible
      if (
        e.key === "Enter" &&
        currentSelection &&
        document.getElementById("highlight-saver-popup").style.display !==
          "none"
      ) {
        saveHighlight()
      }
    })

    // Handle scrolling
    let scrollTimeout
    window.addEventListener("scroll", function () {
      const popup = document.getElementById("highlight-saver-popup")
      if (popup && popup.style.display !== "none") {
        popup.style.display = "none"

        // If user stops scrolling and selection is still active, show popup again
        clearTimeout(scrollTimeout)
        scrollTimeout = setTimeout(() => {
          const selection = window.getSelection()
          if (selection && selection.toString().trim() !== "") {
            showSelectionPopup(selection)
          }
        }, 200)
      }
    })

    // Create the popup when content script loads
    createSelectionPopup()

    console.log("Website Highlight Saver content script loaded")
  } catch (error) {
    console.error("Highlight Saver: Error initializing content script:", error)
  }
}

// Initialize the content script
initializeContentScript()
