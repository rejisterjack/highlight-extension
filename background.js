/**
 * Website Highlight Saver - Background Script
 * Handles storage operations and API communications
 */

import { GROQ_API_KEY } from "./config.js" // Import API key from config

// Initialize storage when extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  console.log("Website Highlight Saver: Extension installed/updated")

  // Initialize storage if needed
  chrome.storage.local.get(["highlights"], function (result) {
    if (!result.highlights) {
      chrome.storage.local.set({ highlights: [] }, () => {
        if (chrome.runtime.lastError) {
          console.error(
            "Storage initialization error:",
            chrome.runtime.lastError
          )
        } else {
          console.log("Storage initialized successfully")
        }
      })
    }
  })

  // You could add a welcome screen or onboarding notification here
})

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  // Save highlight
  if (message.action === "saveHighlight") {
    try {
      chrome.storage.local.get(["highlights"], function (result) {
        // Handle storage retrieval errors
        if (chrome.runtime.lastError) {
          console.error(
            "Error retrieving highlights:",
            chrome.runtime.lastError
          )
          sendResponse({ success: false, error: "Failed to access storage" })
          return
        }

        const highlights = result.highlights || []

        // Validate highlight data
        if (
          !message.highlight ||
          !message.highlight.text ||
          !message.highlight.url
        ) {
          sendResponse({ success: false, error: "Invalid highlight data" })
          return
        }

        highlights.push(message.highlight)

        // Save to storage
        chrome.storage.local.set({ highlights }, () => {
          if (chrome.runtime.lastError) {
            console.error("Error saving highlight:", chrome.runtime.lastError)
            sendResponse({ success: false, error: "Failed to save highlight" })
          } else {
            sendResponse({ success: true })
          }
        })
      })
    } catch (error) {
      console.error("Exception during highlight save:", error)
      sendResponse({ success: false, error: "Exception: " + error.message })
    }
    return true // Keep the message channel open for async response
  }

  // Get all highlights
  if (message.action === "getHighlights") {
    try {
      chrome.storage.local.get(["highlights"], function (result) {
        if (chrome.runtime.lastError) {
          console.error(
            "Error retrieving highlights:",
            chrome.runtime.lastError
          )
          sendResponse({ highlights: [], error: "Failed to access storage" })
        } else {
          sendResponse({ highlights: result.highlights || [] })
        }
      })
    } catch (error) {
      console.error("Exception during highlights retrieval:", error)
      sendResponse({ highlights: [], error: "Exception: " + error.message })
    }
    return true // Keep the message channel open for async response
  }

  // Delete a specific highlight
  if (message.action === "deleteHighlight") {
    try {
      if (!message.highlightId) {
        sendResponse({ success: false, error: "No highlight ID provided" })
        return true
      }

      chrome.storage.local.get(["highlights"], function (result) {
        if (chrome.runtime.lastError) {
          console.error(
            "Error retrieving highlights for deletion:",
            chrome.runtime.lastError
          )
          sendResponse({ success: false, error: "Failed to access storage" })
          return
        }

        const highlights = result.highlights || []
        const updatedHighlights = highlights.filter(
          (h) => h.id !== message.highlightId
        )

        // Check if any highlight was actually removed
        if (updatedHighlights.length === highlights.length) {
          sendResponse({ success: false, error: "Highlight ID not found" })
          return
        }

        chrome.storage.local.set({ highlights: updatedHighlights }, () => {
          if (chrome.runtime.lastError) {
            console.error("Error deleting highlight:", chrome.runtime.lastError)
            sendResponse({
              success: false,
              error: "Failed to delete highlight",
            })
          } else {
            sendResponse({ success: true })
          }
        })
      })
    } catch (error) {
      console.error("Exception during highlight deletion:", error)
      sendResponse({ success: false, error: "Exception: " + error.message })
    }
    return true // Keep the message channel open for async response
  }

  // Summarize highlights using Groq API
  if (message.action === "summarizeHighlights") {
    try {
      const textToSummarize = message.highlights

      // Validate input
      if (!textToSummarize || textToSummarize.trim().length === 0) {
        sendResponse({ error: "No text provided for summarization" })
        return true
      }

      // Use Groq API - store API key securely
      // In a real production environment, consider using environment variables
      // or a secure backend service to manage API keys
      const groqApiKey = GROQ_API_KEY

      // Check if API key is available
      if (!groqApiKey || groqApiKey.trim() === "") {
        console.error("Missing Groq API key")
        sendResponse({
          error: "API key not configured. Please add your Groq API key.",
        })
        return true
      }

      const groqModel = "llama3-8b-8192" // LLaMA 3 model

      // Limit text size to prevent API errors (most APIs have character limits)
      const maxChars = 64000 // Limit to 64K chars as safety measure
      let processedText = textToSummarize
      if (processedText.length > maxChars) {
        processedText =
          processedText.substring(0, maxChars) + "... [truncated due to length]"
      }

      console.log(`Sending ${processedText.length} chars to Groq API`)

      // Call Groq API with proper error handling and timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

      fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqApiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: groqModel,
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant that summarizes text in a clear, concise manner. Focus on extracting key points and insights.",
            },
            {
              role: "user",
              content: `Please summarize the following highlights in a well-structured format, identifying main themes and key points:\n\n${processedText}`,
            },
          ],
          temperature: 0.3,
          max_tokens: 500, // Increased for more comprehensive summaries
        }),
      })
        .then((response) => {
          clearTimeout(timeoutId) // Clear timeout on successful response

          if (!response.ok) {
            return response.json().then((errorData) => {
              throw new Error(
                errorData.error?.message || `API error: ${response.status}`
              )
            })
          }
          return response.json()
        })
        .then((data) => {
          if (data.error) {
            throw new Error(data.error.message || "Unknown error from Groq API")
          }

          const summary = data.choices[0].message.content.trim()
          console.log("Summary received")

          // Improved Markdown to HTML conversion
          const formattedSummary = formatMarkdownToHTML(summary)

          sendResponse({
            summary: formattedSummary,
            model: groqModel,
          })
        })
        .catch((error) => {
          clearTimeout(timeoutId) // Clear timeout on error

          console.error("Error summarizing highlights:", error)

          // Provide user-friendly error message
          let errorMessage = "Failed to generate summary."
          if (error.name === "AbortError") {
            errorMessage =
              "Request timed out. The server took too long to respond."
          } else if (error.message.includes("429")) {
            errorMessage =
              "API rate limit exceeded. Please try again in a few moments."
          } else if (
            error.message.includes("401") ||
            error.message.includes("403")
          ) {
            errorMessage =
              "API authentication failed. Please check your API key."
          }

          sendResponse({
            error: errorMessage,
            technicalDetails: error.message,
          })
        })
    } catch (error) {
      console.error("Exception in API call:", error)
      sendResponse({
        error: `Exception in request processing: ${error.message}`,
      })
    }

    return true // Keep the message channel open for async response
  }
})

/**
 * Formats Markdown text to HTML for proper display in the popup
 * @param {string} markdownText - The markdown text to convert
 * @returns {string} HTML formatted text
 */
function formatMarkdownToHTML(markdownText) {
  if (!markdownText) return ""

  let html = markdownText

  // Convert headers
  html = html
    .replace(/^### (.*$)/gm, "<h4>$1</h4>")
    .replace(/^## (.*$)/gm, "<h3>$1</h3>")
    .replace(/^# (.*$)/gm, "<h2>$1</h2>")

  // Convert bold text
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")

  // Convert italic text
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>")

  // Handle numbered lists
  const numberedListPattern = /^(\d+)\.\s+(.*$)/gm
  if (numberedListPattern.test(html)) {
    // Add opening ol tag before the first list item
    html = html.replace(/^1\.\s+/m, "<ol>\n<li>")

    // Replace all numbered items with li elements
    html = html.replace(/^(\d+)\.\s+(.*$)/gm, "<li>$2</li>")

    // Find where lists end (a non-list line after a list item) and add closing ol tag
    html = html.replace(/(<\/li>)(\n(?!\s*<li>))/g, "$1\n</ol>$2")
  }

  // Handle bullet point lists
  const bulletListPattern = /^[\*\-]\s+(.*$)/gm
  if (bulletListPattern.test(html)) {
    // Add opening ul tag before the first bullet item
    html = html.replace(/^[\*\-]\s+/m, "<ul>\n<li>")

    // Replace all bullet items with li elements
    html = html.replace(/^[\*\-]\s+(.*$)/gm, "<li>$1</li>")

    // Find where lists end and add closing ul tag
    html = html.replace(/(<\/li>)(\n(?!\s*<li>))/g, "$1\n</ul>$2")
  }

  // Add proper blockquote formatting
  html = html.replace(/^>\s+(.*$)/gm, "<blockquote>$1</blockquote>")

  // Convert line breaks to proper paragraphs (handle double line breaks)
  const paragraphs = html.split(/\n\s*\n/)
  html = paragraphs
    .map((p) => {
      // Skip if the paragraph is already an HTML element
      if (p.trim().startsWith("<") && !p.trim().startsWith("<li>")) {
        return p
      }
      // Skip list items which are handled separately
      if (p.includes("<li>")) {
        return p
      }
      return `<p>${p}</p>`
    })
    .join("\n\n")

  // Fix any potential issues with list formatting
  html = html.replace(/<\/ul>\s*<ul>/g, "")
  html = html.replace(/<\/ol>\s*<ol>/g, "")

  return html
}

// Listen for tab updates to potentially sync highlights
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only react when a tab has finished loading
  if (changeInfo.status === "complete" && tab.url) {
    // You could implement syncing of highlights here if needed
  }
})
