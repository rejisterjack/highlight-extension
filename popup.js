/**
 * Website Highlight Saver - Popup Script
 * Handles the extension popup UI and operations
 */

document.addEventListener("DOMContentLoaded", function () {
  // Initialize UI state
  const statusInfo = document.getElementById("status-info")
  statusInfo.textContent = "Loading..."

  // Load all saved highlights when popup opens
  loadHighlights()

  // Add event listeners for buttons
  document
    .getElementById("summarize-btn")
    .addEventListener("click", summarizeHighlights)
  document
    .getElementById("clear-all-btn")
    .addEventListener("click", clearAllHighlights)

  // Close summary view
  const closeSummaryBtn = document.getElementById("close-summary-btn")
  if (closeSummaryBtn) {
    closeSummaryBtn.addEventListener("click", () => {
      document.getElementById("summary-container").classList.add("hidden")
    })
  }
})

/**
 * Loads highlights from storage and displays them
 */
function loadHighlights() {
  try {
    chrome.runtime.sendMessage({ action: "getHighlights" }, (response) => {
      if (chrome.runtime.lastError) {
        showError(
          "Failed to retrieve highlights: " + chrome.runtime.lastError.message
        )
        return
      }

      if (response && response.error) {
        showError("Error loading highlights: " + response.error)
        return
      }

      const highlights = response.highlights || []
      const container = document.getElementById("highlights-container")
      const emptyState = document.getElementById("empty-state")

      // Clear existing content
      container.innerHTML = ""

      // Update highlight count
      updateHighlightCount(highlights.length)

      // Show empty state if no highlights
      if (highlights.length === 0) {
        container.appendChild(emptyState || createEmptyState())
        updateStatusInfo("No highlights saved")
        return
      }

      updateStatusInfo(`Last updated: ${new Date().toLocaleTimeString()}`)

      // Sort highlights by timestamp (newest first)
      highlights.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

      // Create element for each highlight
      highlights.forEach((highlight) => {
        try {
          const highlightElement = createHighlightElement(highlight)
          container.appendChild(highlightElement)
        } catch (err) {
          console.error("Error creating highlight element:", err)
        }
      })
    })
  } catch (err) {
    showError("Failed to load highlights: " + err.message)
  }
}

/**
 * Updates the status info text in the footer
 * @param {string} message - Status message to display
 */
function updateStatusInfo(message) {
  const statusInfo = document.getElementById("status-info")
  if (statusInfo) {
    statusInfo.textContent = message
  }
}

/**
 * Shows an error message to the user
 * @param {string} message - Error message to display
 */
function showError(message) {
  console.error("Highlight Saver Error:", message)

  // Update status
  updateStatusInfo("Error occurred")

  // Check for existing error element and remove it
  const existingError = document.querySelector(".error-message")
  if (existingError) {
    existingError.remove()
  }

  // Create error element
  const errorElement = document.createElement("div")
  errorElement.className = "error error-message"
  errorElement.innerHTML = `
    <span class="material-icons error-icon">error_outline</span>
    <div>${message}</div>
  `

  // Insert at top of container
  const container = document.getElementById("highlights-container")
  if (container) {
    container.prepend(errorElement)
  }
}

/**
 * Creates a dynamic empty state if needed
 * @returns {HTMLElement} Empty state element
 */
function createEmptyState() {
  const emptyState = document.createElement("div")
  emptyState.id = "empty-state"
  emptyState.className = "empty-state"
  emptyState.innerHTML = `
    <div class="empty-state-icon">
      <span class="material-icons">highlight_alt</span>
    </div>
    No highlights saved yet. 
    <br>Select text on any webpage and click "Save Highlight" to get started.
  `
  return emptyState
}

/**
 * Updates highlight count badge
 * @param {number} count - Number of highlights
 */
function updateHighlightCount(count) {
  const badge = document.getElementById("highlight-count")
  if (badge) {
    badge.textContent = count

    // Apply additional styling based on count
    if (count === 0) {
      badge.style.backgroundColor = "#999"
    } else {
      badge.style.backgroundColor = "#4285f4"
    }
  }
}

/**
 * Creates an element for a single highlight
 * @param {Object} highlight - Highlight data object
 * @returns {HTMLElement} Highlight element
 */
function createHighlightElement(highlight) {
  if (!highlight || !highlight.text) {
    console.warn("Invalid highlight data:", highlight)
    return document.createElement("div") // Return empty div as fallback
  }

  const element = document.createElement("div")
  element.className = "highlight-item"
  element.dataset.id = highlight.id

  // Format the date with error handling
  let formattedDate = "Unknown date"
  try {
    const date = new Date(highlight.timestamp)
    if (!isNaN(date)) {
      formattedDate =
        date.toLocaleDateString() + " " + date.toLocaleTimeString()
    }
  } catch (e) {
    console.warn("Error formatting date:", e)
  }

  // Create a truncated URL display with error handling
  let displayUrl = "unknown source"
  try {
    if (highlight.url) {
      const urlObj = new URL(highlight.url)
      displayUrl =
        urlObj.hostname +
        urlObj.pathname.substring(0, 15) +
        (urlObj.pathname.length > 15 ? "..." : "")
    }
  } catch (e) {
    console.warn("Error parsing URL:", e)
    displayUrl = highlight.url
      ? highlight.url.substring(0, 30) + "..."
      : "unknown source"
  }

  // Sanitize highlight text (basic HTML escape)
  const sanitizedText = highlight.text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")

  element.innerHTML = `
    <div class="highlight-text">"${sanitizedText}"</div>
    <div class="highlight-meta">
      <div class="highlight-source">
        <div class="highlight-url" title="${
          highlight.url || ""
        }">${displayUrl}</div>
        <div class="highlight-date">${formattedDate}</div>
      </div>
      <div class="highlight-actions">
        <button class="delete-btn" data-id="${highlight.id}">Delete</button>
      </div>
    </div>
  `

  // Add event listener for delete button with error handling
  const deleteBtn = element.querySelector(".delete-btn")
  if (deleteBtn) {
    deleteBtn.addEventListener("click", function (e) {
      e.stopPropagation()
      deleteHighlight(highlight.id)
    })
  }

  // Add event listener for clicking the highlight to open the source URL
  element.addEventListener("click", function (e) {
    if (!e.target.classList.contains("delete-btn")) {
      try {
        chrome.tabs.create({ url: highlight.url })
      } catch (err) {
        showError("Failed to open URL: " + err.message)
      }
    }
  })

  return element
}

/**
 * Delete a specific highlight
 * @param {string} highlightId - ID of highlight to delete
 */
function deleteHighlight(highlightId) {
  try {
    if (!highlightId) {
      console.warn("No highlight ID provided for deletion")
      return
    }

    chrome.runtime.sendMessage(
      { action: "deleteHighlight", highlightId },
      (response) => {
        if (chrome.runtime.lastError) {
          showError(
            "Failed to delete highlight: " + chrome.runtime.lastError.message
          )
          return
        }

        if (response && response.success) {
          const element = document.querySelector(
            `.highlight-item[data-id="${highlightId}"]`
          )
          if (element) {
            // Add fade-out animation
            element.style.transition = "opacity 0.3s"
            element.style.opacity = "0"

            // Remove after animation
            setTimeout(() => {
              element.remove()

              // Check if we need to show the empty state
              const container = document.getElementById("highlights-container")
              if (container && container.children.length === 0) {
                container.appendChild(createEmptyState())
                updateHighlightCount(0)
              }
            }, 300)
          }

          // Update highlight count
          chrome.runtime.sendMessage(
            { action: "getHighlights" },
            (response) => {
              if (response && response.highlights) {
                updateHighlightCount(response.highlights.length)
                updateStatusInfo("Highlight deleted")
              }
            }
          )
        } else {
          const errorMsg =
            response && response.error ? response.error : "Unknown error"
          showError("Failed to delete highlight: " + errorMsg)
        }
      }
    )
  } catch (err) {
    showError("Error during deletion: " + err.message)
  }
}

/**
 * Clear all highlights after confirmation
 */
function clearAllHighlights() {
  try {
    const confirmClear = confirm(
      "Are you sure you want to delete all highlights? This cannot be undone."
    )

    if (confirmClear) {
      chrome.storage.local.set({ highlights: [] }, () => {
        if (chrome.runtime.lastError) {
          showError(
            "Failed to clear highlights: " + chrome.runtime.lastError.message
          )
          return
        }

        loadHighlights() // Reload to show empty state
        updateStatusInfo("All highlights cleared")
      })
    }
  } catch (err) {
    showError("Error clearing highlights: " + err.message)
  }
}

/**
 * Request an AI summary of all highlights
 */
function summarizeHighlights() {
  try {
    // Get all highlights to summarize
    chrome.runtime.sendMessage({ action: "getHighlights" }, (response) => {
      if (chrome.runtime.lastError) {
        showError(
          "Failed to retrieve highlights: " + chrome.runtime.lastError.message
        )
        return
      }

      if (response && response.error) {
        showError("Error retrieving highlights: " + response.error)
        return
      }

      const highlights = response.highlights || []

      if (highlights.length === 0) {
        showError("No highlights to summarize")
        return
      }

      // Show loading state
      const summaryContainer = document.getElementById("summary-container")
      const summaryContent = document.getElementById("summary-content")

      if (!summaryContainer || !summaryContent) {
        showError("UI elements not found")
        return
      }

      summaryContainer.classList.remove("hidden")
      summaryContent.innerHTML = `
        <div class="loading">
          <div class="spinner"></div>
          <p>Generating summary using LLaMA 3...</p>
        </div>
      `

      // Prepare highlight texts with metadata for better context
      const highlightTexts = highlights
        .map((h, index) => {
          let source = ""
          try {
            const urlObj = new URL(h.url)
            source = urlObj.hostname
          } catch (e) {
            source = "unknown source"
          }

          return `[${index + 1}] "${h.text}" (from ${source})`
        })
        .join("\n\n")

      // Set a reasonable timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("Request timed out after 60 seconds")),
          60000
        )
      })

      // Send request with timeout
      const summarizePromise = new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            action: "summarizeHighlights",
            highlights: highlightTexts,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message))
              return
            }
            resolve(response)
          }
        )
      })

      // Race the promises
      Promise.race([summarizePromise, timeoutPromise])
        .then((response) => {
          if (response && response.error) {
            summaryContent.innerHTML = `
              <div class="error">
                <span class="material-icons error-icon">error_outline</span>
                <div>${response.error}</div>
              </div>
            `
          } else if (response && response.summary) {
            // Set innerHTML directly to preserve HTML formatting
            summaryContent.innerHTML = response.summary

            // Update status
            updateStatusInfo("Summary generated")
          } else {
            summaryContent.innerHTML = `
              <div class="error">
                <span class="material-icons error-icon">error_outline</span>
                <div>Unexpected response from the server.</div>
              </div>
            `
          }
        })
        .catch((error) => {
          summaryContent.innerHTML = `
            <div class="error">
              <span class="material-icons error-icon">error_outline</span>
              <div>Error: ${error.message}</div>
            </div>
          `
        })
    })
  } catch (error) {
    showError("Summarization error: " + error.message)
  }
}
