const shortcuts = {
  "[": () => window.history.back(),
  "]": () => window.history.forward(),
  "-": () => zoomOut(),
  "=": () => zoomIn(),
  "+": () => zoomIn(),
  0: () => setZoom("100%"),
  r: () => window.location.reload(),
  ArrowUp: () => scrollTo(0, 0),
  ArrowDown: () => scrollTo(0, document.body.scrollHeight),
};

function setZoom(zoom) {
  // Use native WebView zoom (WKWebView pageZoom / WebView2 ZoomFactor) instead of
  // CSS hacks. `transform: scale` and `html.style.zoom` break complex SPAs like
  // ChatGPT: the page shifts right on Windows and parts of the UI stop repainting
  // on macOS. Native zoom recalculates layout exactly like a browser does.
  const invoke = window.__TAURI__?.core?.invoke;
  if (invoke) {
    invoke("set_zoom", { percent: parseFloat(zoom) }).catch(() => {});
  }

  window.localStorage.setItem("htmlZoom", zoom);
}

function zoomCommon(zoomChange) {
  const currentZoom = window.localStorage.getItem("htmlZoom") || "100%";
  setZoom(zoomChange(currentZoom));
}

function zoomIn() {
  zoomCommon((currentZoom) => `${Math.min(parseInt(currentZoom) + 10, 200)}%`);
}

function zoomOut() {
  zoomCommon((currentZoom) => `${Math.max(parseInt(currentZoom) - 10, 30)}%`);
}

let pasteAsPlainTextPending = false;

function triggerPasteAsPlainText() {
  pasteAsPlainTextPending = true;
  document.execCommand("paste");
  setTimeout(() => {
    pasteAsPlainTextPending = false;
  }, 100);
}

function handleShortcut(event) {
  if (shortcuts[event.key]) {
    event.preventDefault();
    shortcuts[event.key]();
  }
}

const DOWNLOADABLE_FILE_EXTENSIONS = {
  documents: [
    "pdf",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
    "txt",
    "rtf",
    "odt",
    "ods",
    "odp",
    "pages",
    "numbers",
    "key",
    "epub",
    "mobi",
  ],
  archives: [
    "zip",
    "rar",
    "7z",
    "tar",
    "gz",
    "gzip",
    "bz2",
    "xz",
    "lzma",
    "deb",
    "rpm",
    "pkg",
    "msi",
    "exe",
    "dmg",
    "apk",
    "ipa",
  ],
  data: [
    "json",
    "xml",
    "csv",
    "sql",
    "db",
    "sqlite",
    "yaml",
    "yml",
    "toml",
    "ini",
    "cfg",
    "conf",
    "log",
  ],
  code: [
    "js",
    "ts",
    "jsx",
    "tsx",
    "css",
    "scss",
    "sass",
    "less",
    "sh",
    "bat",
    "ps1",
  ],
  fonts: ["ttf", "otf", "woff", "woff2", "eot"],
  design: ["ai", "psd", "sketch", "fig", "xd"],
  system: [
    "iso",
    "img",
    "bin",
    "torrent",
    "jar",
    "war",
    "indd",
    "fla",
    "swf",
    "raw",
  ],
};

const ALL_DOWNLOADABLE_EXTENSIONS = Object.values(
  DOWNLOADABLE_FILE_EXTENSIONS,
).flat();

const PREVIEWABLE_MEDIA_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "tiff",
  "tif",
  "avif",
  "heic",
  "heif",
  "mp4",
  "webm",
  "mov",
  "m4v",
  "mkv",
  "avi",
  "ogv",
  "mp3",
  "wav",
  "ogg",
  "flac",
  "aac",
  "m4a",
];

const DOWNLOAD_PATH_PATTERNS = [
  "/download/",
  "/files/",
  "/attachments/",
  "/assets/",
  "/releases/",
  "/dist/",
];

// Language detection utilities
function getUserLanguage() {
  return navigator.language || navigator.userLanguage;
}

function isChineseLanguage(language = getUserLanguage()) {
  return (
    language &&
    (language.startsWith("zh") ||
      language.includes("CN") ||
      language.includes("TW") ||
      language.includes("HK"))
  );
}

// User notification helper
function showDownloadError(filename) {
  const isChinese = isChineseLanguage();
  const message = isChinese
    ? `下载失败: ${filename}`
    : `Download failed: ${filename}`;

  if (window.Notification && Notification.permission === "granted") {
    new Notification(isChinese ? "下载错误" : "Download Error", {
      body: message,
    });
  } else {
    console.error(message);
  }
}

function getExtension(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const extensionIndex = pathname.lastIndexOf(".");
    return extensionIndex > -1 ? pathname.slice(extensionIndex + 1) : "";
  } catch (e) {
    return "";
  }
}

function isPreviewableMedia(url) {
  const extension = getExtension(url);
  return PREVIEWABLE_MEDIA_EXTENSIONS.includes(extension);
}

// Unified file detection - replaces both isDownloadLink and isFileLink
function isDownloadableFile(url) {
  try {
    const extension = getExtension(url);
    if (PREVIEWABLE_MEDIA_EXTENSIONS.includes(extension)) {
      return false;
    }

    const urlObj = new URL(url);
    const hasDownloadHints =
      urlObj.searchParams.has("download") ||
      urlObj.searchParams.has("attachment");

    if (hasDownloadHints) {
      return true;
    }

    return (
      ALL_DOWNLOADABLE_EXTENSIONS.includes(extension) ||
      DOWNLOAD_PATH_PATTERNS.some((pattern) =>
        urlObj.pathname.toLowerCase().includes(pattern),
      )
    );
  } catch (e) {
    return false;
  }
}

function normalizeAnchorHref(rawHref) {
  return typeof rawHref === "string" ? rawHref.trim() : "";
}

function shouldBypassPakeLinkHandling(rawHref) {
  const normalizedHref = normalizeAnchorHref(rawHref).toLowerCase();
  if (!normalizedHref) {
    return false;
  }

  return (
    normalizedHref.startsWith("javascript:") || normalizedHref.startsWith("#")
  );
}

function shouldNavigateAuthInCurrentWindow() {
  return /macintosh|mac os x/i.test(navigator.userAgent);
}

function canNavigateAuthUrl(url) {
  const normalizedUrl = normalizeAnchorHref(url).toLowerCase();
  return normalizedUrl !== "" && normalizedUrl !== "about:blank";
}

function navigateInCurrentWindow(url) {
  window.location.href = url;
  return window;
}

function openAuthNavigation(originalWindowOpen, url, name, specs) {
  if (shouldNavigateAuthInCurrentWindow() && canNavigateAuthUrl(url)) {
    return navigateInCurrentWindow(url);
  }

  const authWindow = originalWindowOpen.call(window, url, name, specs);
  if (!authWindow) {
    return navigateInCurrentWindow(url);
  }

  return authWindow;
}

document.addEventListener("DOMContentLoaded", () => {
  const tauri = window.__TAURI__;
  const appWindow = tauri.window.getCurrentWindow();
  const invoke = tauri.core.invoke;
  const pakeConfig = window["pakeConfig"] || {};
  const forceInternalNavigation = pakeConfig.force_internal_navigation === true;
  const internalUrlRegex = pakeConfig.internal_url_regex || "";
  let internalUrlPattern = null;
  if (internalUrlRegex) {
    try {
      internalUrlPattern = new RegExp(internalUrlRegex);
    } catch (e) {
      console.error("[Pake] Invalid internal_url_regex pattern:", e);
    }
  }

  if (!document.getElementById("pake-top-dom")) {
    const topDom = document.createElement("div");
    topDom.id = "pake-top-dom";
    document.body.appendChild(topDom);
  }

  const domEl = document.getElementById("pake-top-dom");

  domEl.addEventListener("touchstart", () => {
    appWindow.startDragging();
  });

  domEl.addEventListener("mousedown", (e) => {
    e.preventDefault();
    if (e.buttons === 1 && e.detail !== 2) {
      appWindow.startDragging();
    }
  });

  domEl.addEventListener("dblclick", () => {
    appWindow.isFullscreen().then((fullscreen) => {
      appWindow.setFullscreen(!fullscreen);
    });
  });

  if (window["pakeConfig"]?.disabled_web_shortcuts !== true) {
    document.addEventListener("keyup", (event) => {
      if (/windows|linux/i.test(navigator.userAgent) && event.ctrlKey) {
        handleShortcut(event);
      }
      if (/macintosh|mac os x/i.test(navigator.userAgent) && event.metaKey) {
        handleShortcut(event);
      }
    });
  }

  document.addEventListener(
    "paste",
    (event) => {
      if (pasteAsPlainTextPending) {
        event.preventDefault();
        event.stopImmediatePropagation();

        const text = event.clipboardData?.getData("text/plain") || "";
        if (text) {
          document.execCommand("insertText", false, text);
        }
      }
    },
    true,
  );

  // Trigger a native browser download via a transient anchor click. The Rust
  // on_download handler then writes the file to the Downloads folder. This is
  // used for blob:/data: URLs because routing their bytes through the Tauri
  // IPC fails on strict-CSP sites (e.g. Gemini), whose connect-src blocks the
  // IPC origin. The native download path is independent of the page CSP.
  function triggerNativeDownload(url, filename) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename || "";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  // process special download protocol['data:','blob:']
  const isSpecialDownload = (url) =>
    ["blob", "data"].some((protocol) => url.startsWith(protocol));

  const isDownloadRequired = (url, anchorElement, e) =>
    anchorElement.download || e.metaKey || e.ctrlKey || isDownloadableFile(url);

  const handleExternalLink = (url) => {
    // Don't try to open blob: or data: URLs with shell
    if (isSpecialDownload(url)) {
      console.warn("Cannot open special URL with shell:", url);
      return;
    }

    invoke("plugin:shell|open", {
      path: url,
    }).catch((error) => {
      console.error("Failed to open URL with shell:", url, error);
    });
  };

  // Check if URL belongs to the same domain (including subdomains)
  const isSameDomain = (url) => {
    try {
      const linkUrl = new URL(url);
      const currentUrl = new URL(window.location.href);

      if (linkUrl.hostname === currentUrl.hostname) return true;

      // Extract root domain (e.g., bilibili.com from www.bilibili.com)
      const getRootDomain = (hostname) => {
        const parts = hostname.split(".");
        return parts.length >= 2 ? parts.slice(-2).join(".") : hostname;
      };

      return (
        getRootDomain(currentUrl.hostname) === getRootDomain(linkUrl.hostname)
      );
    } catch (e) {
      return false;
    }
  };

  // Check if URL should be treated as internal based on regex pattern or domain
  const isInternalUrl = (url) => {
    // If regex pattern is configured, use it as the primary check
    if (internalUrlPattern) {
      try {
        return internalUrlPattern.test(url);
      } catch (e) {
        console.error("[Pake] Error testing internal_url_regex:", e);
        // Fall back to domain check on error
        return isSameDomain(url);
      }
    }
    // Default to domain-based check
    return isSameDomain(url);
  };

  const detectAnchorElementClick = (e) => {
    // Safety check: ensure e.target exists and is an Element with closest method
    if (!e.target || typeof e.target.closest !== "function") {
      return;
    }
    const anchorElement = e.target.closest("a");

    if (anchorElement && anchorElement.href) {
      const rawHref = anchorElement.getAttribute("href") || "";
      if (shouldBypassPakeLinkHandling(rawHref)) {
        return;
      }

      const target = anchorElement.target;
      const hrefUrl = new URL(anchorElement.href);
      const absoluteUrl = hrefUrl.href;
      let filename = anchorElement.download || getFilenameFromUrl(absoluteUrl);

      // Keep OAuth/authentication flows inside the app. Without --new-window,
      // navigate in place so the SSO redirect chain and callback stay in the
      // webview instead of falling through to the system browser.
      if (window.isAuthLink(absoluteUrl)) {
        console.log("[Pake] Handling OAuth navigation in-app:", absoluteUrl);
        e.preventDefault();
        e.stopImmediatePropagation();

        if (window.pakeConfig?.new_window) {
          openAuthNavigation(
            originalWindowOpen,
            absoluteUrl,
            "_blank",
            "width=1200,height=800,scrollbars=yes,resizable=yes",
          );
        } else {
          window.location.href = absoluteUrl;
        }

        return;
      }

      // Handle _blank links: internal links stay in-app, external links open in the system browser
      if (target === "_blank") {
        if (forceInternalNavigation) {
          e.preventDefault();
          e.stopImmediatePropagation();
          window.location.href = absoluteUrl;
          return;
        }

        if (isInternalUrl(absoluteUrl)) {
          // With --new-window the Rust on_new_window handler opens an in-app
          // window; without it, deferring to the native handler sends the
          // _blank target to the system browser and strands SSO callbacks.
          // Navigate in place so internal links stay inside the webview.
          if (!window.pakeConfig?.new_window) {
            e.preventDefault();
            e.stopImmediatePropagation();
            window.location.href = absoluteUrl;
          }
          return;
        }

        e.preventDefault();
        e.stopImmediatePropagation();
        handleExternalLink(absoluteUrl);
        return;
      }

      if (target === "_new") {
        if (forceInternalNavigation) {
          e.preventDefault();
          e.stopImmediatePropagation();
          window.location.href = absoluteUrl;
          return;
        }

        e.preventDefault();
        handleExternalLink(absoluteUrl);
        return;
      }

      // Process download links.
      if (isDownloadRequired(absoluteUrl, anchorElement, e)) {
        // Let the browser download blob:/data: URLs natively; the Rust
        // on_download handler saves them to the Downloads folder. Routing them
        // through the IPC fails on strict-CSP sites (e.g. Gemini), whose
        // connect-src blocks the IPC origin, and on downloads triggered from a
        // sandboxed iframe where the IPC can't be reached.
        if (isSpecialDownload(absoluteUrl)) {
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        const userLanguage = getUserLanguage();
        invoke("download_file", {
          params: { url: absoluteUrl, filename, language: userLanguage },
        });
        return;
      }

      // Handle regular links: internal URLs allow normal navigation, external links open in the system browser
      if (!target || target === "_self") {
        // Optimization: Allow previewable media to be handled by the app/browser directly
        // This fixes issues where CDN links are treated as external
        if (isPreviewableMedia(absoluteUrl)) {
          return;
        }

        if (!isInternalUrl(absoluteUrl)) {
          if (forceInternalNavigation) {
            return;
          }

          e.preventDefault();
          e.stopImmediatePropagation();
          handleExternalLink(absoluteUrl);
        }
      }
    }
  };

  // Prevent some special websites from executing in advance, before the click event is triggered.
  document.addEventListener("click", detectAnchorElementClick, true);

  // Rewrite the window.open function.
  const originalWindowOpen = window.open;
  window.open = function (url, name, specs) {
    const normalizedUrl = normalizeAnchorHref(url);
    if (normalizedUrl.startsWith("#")) {
      window.location.href = new URL(normalizedUrl, window.location.href).href;
      return window;
    }

    if (shouldBypassPakeLinkHandling(url)) {
      return originalWindowOpen.call(window, url, name, specs);
    }

    // Avoid macOS WebKit auth-popup crashes by navigating auth URLs in-place.
    if (window.isAuthPopup(url, name)) {
      try {
        const baseUrl = window.location.origin + window.location.pathname;
        const absoluteUrl = new URL(url, baseUrl).href;
        return openAuthNavigation(originalWindowOpen, absoluteUrl, name, specs);
      } catch (error) {
        return openAuthNavigation(originalWindowOpen, url, name, specs);
      }
    }

    try {
      const baseUrl = window.location.origin + window.location.pathname;
      const hrefUrl = new URL(url, baseUrl);
      const absoluteUrl = hrefUrl.href;

      if (!isInternalUrl(absoluteUrl)) {
        if (forceInternalNavigation) {
          return originalWindowOpen.call(window, absoluteUrl, name, specs);
        }

        handleExternalLink(absoluteUrl);
        return null;
      }

      // With --new-window the native handler opens an in-app window; without it,
      // originalWindowOpen would route the internal target to the system browser
      // and strand SSO callbacks, so navigate in place instead.
      if (!window.pakeConfig?.new_window) {
        window.location.href = absoluteUrl;
        return window;
      }

      return originalWindowOpen.call(window, absoluteUrl, name, specs);
    } catch (error) {
      return originalWindowOpen.call(window, url, name, specs);
    }
  };

  // Set the default zoom, There are problems with Loop without using try-catch.
  try {
    setDefaultZoom();
  } catch (e) {
    console.log(e);
  }

  // Fix Chinese input method "Enter" on Safari
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Process") e.stopPropagation();
    },
    true,
  );

  // Language detection and texts
  const isChinese = isChineseLanguage();

  const menuTexts = {
    // Media operations
    downloadImage: isChinese ? "下载图片" : "Download Image",
    downloadVideo: isChinese ? "下载视频" : "Download Video",
    downloadFile: isChinese ? "下载文件" : "Download File",
    copyAddress: isChinese ? "复制地址" : "Copy Address",
    openInBrowser: isChinese ? "浏览器打开" : "Open in Browser",
  };

  // Menu theme configuration
  const MENU_THEMES = {
    dark: {
      menu: {
        background: "#2d2d2d",
        border: "1px solid #404040",
        color: "#ffffff",
        shadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
      },
      item: {
        divider: "#404040",
        hoverBg: "#404040",
      },
    },
    light: {
      menu: {
        background: "#ffffff",
        border: "1px solid #e0e0e0",
        color: "#333333",
        shadow: "0 4px 16px rgba(0, 0, 0, 0.15)",
      },
      item: {
        divider: "#f0f0f0",
        hoverBg: "#d0d0d0",
      },
    },
  };

  // Theme detection and menu styles
  function getTheme() {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    return prefersDark ? "dark" : "light";
  }

  function getMenuStyles(theme = getTheme()) {
    return MENU_THEMES[theme] || MENU_THEMES.light;
  }

  // Menu configuration constants
  const MENU_CONFIG = {
    id: "pake-context-menu",
    minWidth: "120px", // Compact width for better UX
    borderRadius: "6px", // Slightly more rounded for modern look
    fontSize: "13px",
    zIndex: "999999",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    // Menu item dimensions
    itemPadding: "8px 16px", // Increased vertical padding for better comfort
    itemLineHeight: "1.2",
    itemBorderRadius: "3px", // Subtle rounded corners for menu items
    itemTransition: "background-color 0.1s ease",
  };

  // Create custom context menu
  function createContextMenu() {
    const contextMenu = document.createElement("div");
    contextMenu.id = MENU_CONFIG.id;
    const styles = getMenuStyles();

    contextMenu.style.cssText = `
      position: fixed;
      background: ${styles.menu.background};
      border: ${styles.menu.border};
      border-radius: ${MENU_CONFIG.borderRadius};
      box-shadow: ${styles.menu.shadow};
      padding: 4px 0;
      min-width: ${MENU_CONFIG.minWidth};
      font-family: ${MENU_CONFIG.fontFamily};
      font-size: ${MENU_CONFIG.fontSize};
      color: ${styles.menu.color};
      z-index: ${MENU_CONFIG.zIndex};
      display: none;
      user-select: none;
    `;
    document.body.appendChild(contextMenu);
    return contextMenu;
  }

  function createMenuItem(text, onClick, divider = false) {
    const item = document.createElement("div");
    const styles = getMenuStyles();

    item.style.cssText = `
      padding: ${MENU_CONFIG.itemPadding};
      cursor: pointer;
      user-select: none;
      font-weight: 400;
      line-height: ${MENU_CONFIG.itemLineHeight};
      transition: ${MENU_CONFIG.itemTransition};
      white-space: nowrap;
      border-radius: ${MENU_CONFIG.itemBorderRadius};
      margin: 2px 4px;
      border-bottom: ${divider ? `1px solid ${styles.item.divider}` : "none"};
    `;
    item.textContent = text;

    item.addEventListener("mouseenter", () => {
      item.style.backgroundColor = styles.item.hoverBg;
    });

    item.addEventListener("mouseleave", () => {
      item.style.backgroundColor = "transparent";
    });

    item.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
      hideContextMenu();
    });

    return item;
  }

  function showContextMenu(x, y, items) {
    let contextMenu = document.getElementById(MENU_CONFIG.id);

    // Always recreate menu to ensure theme is up-to-date
    if (contextMenu) {
      contextMenu.remove();
    }
    contextMenu = createContextMenu();

    items.forEach((item) => {
      contextMenu.appendChild(item);
    });

    contextMenu.style.left = x + "px";
    contextMenu.style.top = y + "px";
    contextMenu.style.display = "block";

    // Adjust position if menu goes off screen
    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      contextMenu.style.left = x - rect.width + "px";
    }
    if (rect.bottom > window.innerHeight) {
      contextMenu.style.top = y - rect.height + "px";
    }
  }

  function hideContextMenu() {
    const contextMenu = document.getElementById(MENU_CONFIG.id);
    if (contextMenu) {
      contextMenu.style.display = "none";
    }
  }

  function downloadImage(imageUrl) {
    // Convert relative URLs to absolute
    if (imageUrl.startsWith("/")) {
      imageUrl = window.location.origin + imageUrl;
    } else if (imageUrl.startsWith("./")) {
      imageUrl = new URL(imageUrl, window.location.href).href;
    } else if (
      !imageUrl.startsWith("http") &&
      !imageUrl.startsWith("data:") &&
      !imageUrl.startsWith("blob:")
    ) {
      imageUrl = new URL(imageUrl, window.location.href).href;
    }

    // Generate filename from URL
    const filename = getFilenameFromUrl(imageUrl) || "image";

    // Handle different URL types
    if (isSpecialDownload(imageUrl)) {
      // Download blob:/data: natively so it works under strict CSP; the Rust
      // on_download handler saves it to the Downloads folder.
      triggerNativeDownload(imageUrl, filename);
    } else {
      // Regular HTTP(S) image
      const userLanguage = getUserLanguage();
      invoke("download_file", {
        params: {
          url: imageUrl,
          filename: filename,
          language: userLanguage,
        },
      }).catch((error) => {
        console.error("Failed to download image:", filename, error);
        showDownloadError(filename);
      });
    }
  }

  // Check if element is media (image or video)
  function getMediaInfo(target) {
    // Check for img tags
    if (target.tagName.toLowerCase() === "img") {
      return { isMedia: true, url: target.src, type: "image" };
    }

    // Check for video tags
    if (target.tagName.toLowerCase() === "video") {
      return {
        isMedia: true,
        url: target.src || target.currentSrc,
        type: "video",
      };
    }

    // Check for elements with background images
    if (target.style && target.style.backgroundImage) {
      const bgImage = target.style.backgroundImage;
      const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
      if (urlMatch) {
        return { isMedia: true, url: urlMatch[1], type: "image" };
      }
    }

    // Check for parent elements with background images
    const parentWithBg =
      target && typeof target.closest === "function"
        ? target.closest('[style*="background-image"]')
        : null;
    if (parentWithBg) {
      const bgImage = parentWithBg.style.backgroundImage;
      const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
      if (urlMatch) {
        return { isMedia: true, url: urlMatch[1], type: "image" };
      }
    }

    return { isMedia: false, url: "", type: "" };
  }

  // Simplified menu builder
  function buildMenuItems(type, data) {
    const userLanguage = getUserLanguage();
    const items = [];

    switch (type) {
      case "media":
        const downloadText =
          data.type === "image"
            ? menuTexts.downloadImage
            : menuTexts.downloadVideo;
        items.push(
          createMenuItem(downloadText, () => downloadImage(data.url)),
          createMenuItem(menuTexts.copyAddress, () =>
            navigator.clipboard.writeText(data.url),
          ),
          createMenuItem(menuTexts.openInBrowser, () =>
            invoke("plugin:shell|open", { path: data.url }),
          ),
        );
        break;

      case "link":
        if (data.isFile) {
          items.push(
            createMenuItem(menuTexts.downloadFile, () => {
              const filename = getFilenameFromUrl(data.url);
              invoke("download_file", {
                params: { url: data.url, filename, language: userLanguage },
              }).catch((error) => {
                console.error("Failed to download file:", filename, error);
                showDownloadError(filename);
              });
            }),
          );
        }
        items.push(
          createMenuItem(menuTexts.copyAddress, () =>
            navigator.clipboard.writeText(data.url),
          ),
          createMenuItem(menuTexts.openInBrowser, () =>
            invoke("plugin:shell|open", { path: data.url }),
          ),
        );
        break;
    }

    return items;
  }

  // Handle right-click context menu
  document.addEventListener(
    "contextmenu",
    function (event) {
      const target = event.target;

      // Check for media elements (images/videos)
      const mediaInfo = getMediaInfo(target);

      // Check for links (but not if it's media)
      const linkElement =
        target && typeof target.closest === "function"
          ? target.closest("a")
          : null;
      const isLink = linkElement && linkElement.href && !mediaInfo.isMedia;

      // Only show custom menu for media or links
      if (mediaInfo.isMedia || isLink) {
        event.preventDefault();
        event.stopPropagation();

        let menuItems = [];

        if (mediaInfo.isMedia) {
          menuItems = buildMenuItems("media", mediaInfo);
        } else if (isLink) {
          const linkUrl = linkElement.href;
          menuItems = buildMenuItems("link", {
            url: linkUrl,
            isFile: isDownloadableFile(linkUrl),
          });
        }

        showContextMenu(event.clientX, event.clientY, menuItems);
      }
      // For all other elements, let browser's default context menu handle it
    },
    true,
  );

  // Hide context menu when clicking elsewhere
  document.addEventListener("click", hideContextMenu);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideContextMenu();
    }
  });
});

// Bridge the Web Notification + Web Badging APIs to Pake's Rust commands so
// pages running inside the webview can drive the macOS dock badge (and
// taskbar badge on Linux/Windows). Installs synchronously instead of waiting
// for DOMContentLoaded so feature-detection on Notification/setAppBadge
// returns the polyfill before site scripts run.
(function () {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return;

  let permVal = "granted";
  let lastNotifTime = 0;
  let lastNotif = null;
  // Pages that drive the badge directly via setAppBadge own its lifecycle;
  // notifications-driven counts auto-clear on the next user interaction.
  let pageManagedBadge = false;
  let autoBadgeActive = false;

  const normalizeBadgeCount = (count) => {
    if (typeof count !== "number" || !Number.isFinite(count)) {
      throw new TypeError("Badge count must be a finite number.");
    }
    const normalized = Math.floor(count);
    return normalized > 0 ? Math.min(normalized, 99999) : null;
  };
  const setBadge = (count) => {
    pageManagedBadge = true;
    autoBadgeActive = false;
    return invoke("set_dock_badge", { count }).catch(() => {});
  };
  const clearBadge = () => invoke("clear_dock_badge").catch(() => {});
  const setLabel = (label) => {
    pageManagedBadge = true;
    autoBadgeActive = false;
    return invoke("set_dock_badge_label", { label }).catch(() => {});
  };
  const incrementAutoBadge = () => {
    if (pageManagedBadge) return Promise.resolve();
    autoBadgeActive = true;
    return invoke("increment_dock_badge").catch(() => {});
  };

  window.addEventListener("focus", () => {
    if (lastNotif?.onclick && Date.now() - lastNotifTime < 5000) {
      lastNotif.onclick(new Event("click"));
      lastNotif = null;
    }
  });

  const clearAutoBadge = () => {
    if (pageManagedBadge || !autoBadgeActive) return;
    autoBadgeActive = false;
    clearBadge();
  };
  document.addEventListener("click", clearAutoBadge, true);
  document.addEventListener("keydown", clearAutoBadge, true);

  const wrappedNotification = function (title, options) {
    const body = options?.body || "";
    let icon = options?.icon || "";
    if (icon.startsWith("/")) {
      icon = window.location.origin + icon;
    }

    const notif = {
      onclick: null,
      onclose: null,
      onshow: null,
      onerror: null,
      close: () => {},
    };

    lastNotifTime = Date.now();
    lastNotif = notif;
    invoke("send_notification", { params: { title, body, icon } })
      .then(() => incrementAutoBadge())
      .then(() => {
        if (notif.onshow) notif.onshow(new Event("show"));
      });

    return notif;
  };

  wrappedNotification.requestPermission = async () => "granted";
  Object.defineProperty(wrappedNotification, "permission", {
    enumerable: true,
    get: () => permVal,
    set: (v) => {
      permVal = v;
    },
  });

  try {
    Object.defineProperty(window, "Notification", {
      configurable: true,
      writable: true,
      value: wrappedNotification,
    });
  } catch (_) {}

  // Web Badging API: https://wicg.github.io/badging/
  // setAppBadge() with no argument shows an indicator dot; with a number,
  // shows the count (0 clears). clearAppBadge() removes the badge entirely.
  const setAppBadge = (count) => {
    if (count === undefined) return setLabel("•");
    let normalized;
    try {
      normalized = normalizeBadgeCount(count);
    } catch (error) {
      return Promise.reject(error);
    }
    if (normalized === null) {
      pageManagedBadge = false;
      autoBadgeActive = false;
      return clearBadge();
    }
    return setBadge(normalized);
  };
  const clearAppBadge = () => {
    pageManagedBadge = false;
    autoBadgeActive = false;
    return clearBadge();
  };
  try {
    Object.defineProperty(navigator, "setAppBadge", {
      configurable: true,
      writable: true,
      value: setAppBadge,
    });
    Object.defineProperty(navigator, "clearAppBadge", {
      configurable: true,
      writable: true,
      value: clearAppBadge,
    });
  } catch (_) {}
})();

function setDefaultZoom() {
  const htmlZoom = window.localStorage.getItem("htmlZoom");
  if (htmlZoom) {
    setZoom(htmlZoom);
  } else if (window.pakeConfig?.zoom && window.pakeConfig.zoom !== 100) {
    setZoom(`${window.pakeConfig.zoom}%`);
  }
}

function getFilenameFromUrl(url) {
  try {
    const urlPath = new URL(url).pathname;
    let filename = urlPath.substring(urlPath.lastIndexOf("/") + 1);

    // If no filename or no extension, generate one
    if (!filename || !filename.includes(".")) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

      // Detect image type from URL or data URI
      if (url.startsWith("data:image/")) {
        const mimeType = url.substring(11, url.indexOf(";"));
        filename = `image-${timestamp}.${mimeType}`;
      } else {
        // Default to common image extensions based on common patterns
        if (url.includes("jpg") || url.includes("jpeg")) {
          filename = `image-${timestamp}.jpg`;
        } else if (url.includes("png")) {
          filename = `image-${timestamp}.png`;
        } else if (url.includes("gif")) {
          filename = `image-${timestamp}.gif`;
        } else if (url.includes("webp")) {
          filename = `image-${timestamp}.webp`;
        } else if (url.includes("svg")) {
          filename = `image-${timestamp}.svg`;
        } else {
          filename = `image-${timestamp}.png`; // default
        }
      }
    }

    return filename;
  } catch (e) {
    // Fallback for invalid URLs
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `image-${timestamp}.png`;
  }
}

// Zoom Slider UI - Press Ctrl+Z to toggle
(function() {
  const SLIDER_ID = 'pake-zoom-slider';
  let sliderEl = null;

  function createZoomSlider() {
    if (sliderEl) return sliderEl;
    const existing = document.getElementById(SLIDER_ID);
    if (existing) existing.remove();

    const currentZoom = parseInt(window.localStorage.getItem("htmlZoom") || (window.pakeConfig?.zoom || 100));

    const div = document.createElement('div');
    div.id = SLIDER_ID;
    div.innerHTML = `
      <style>
        #${SLIDER_ID} { position: fixed; bottom: 80px; right: 20px; background: #1e1e1e; border: 1px solid #333; border-radius: 12px; padding: 16px; z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; box-shadow: 0 8px 32px rgba(0,0,0,0.4); min-width: 200px; }
        #${SLIDER_ID} .title { color: #fff; font-size: 12px; margin-bottom: 12px; text-align: center; font-weight: 600; }
        #${SLIDER_ID} .zoom-display { color: #58a6ff; font-size: 24px; font-weight: 700; text-align: center; margin-bottom: 10px; }
        #${SLIDER_ID} input[type="range"] { width: 100%; height: 6px; -webkit-appearance: none; background: #333; border-radius: 3px; outline: none; margin: 8px 0; }
        #${SLIDER_ID} input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; background: #58a6ff; border-radius: 50%; cursor: pointer; }
        #${SLIDER_ID} .btn-row { display: flex; justify-content: space-between; margin-top: 12px; }
        #${SLIDER_ID} button { background: #333; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; flex: 1; margin: 0 4px; }
        #${SLIDER_ID} button:hover { background: #444; }
        #${SLIDER_ID} .close-btn { background: #d32f2f !important; font-size: 11px; padding: 4px 8px; margin-top: 8px; }
        #${SLIDER_ID} .close-btn:hover { background: #b71c1c !important; }
      </style>
      <div class="title">🔍 PAGE ZOOM</div>
      <div class="zoom-display"><span id="${SLIDER_ID}-value">${currentZoom}</span>%</div>
      <input type="range" id="${SLIDER_ID}-range" min="30" max="200" value="${currentZoom}">
      <div class="btn-row">
        <button onclick="window.pakeZoomMinus()">➖ Minus</button>
        <button onclick="window.pakeZoomPlus()">➕ Plus</button>
      </div>
      <button class="close-btn" onclick="document.getElementById('${SLIDER_ID}').remove(); window.pakeZoomSliderEl=null;">✕ Close</button>
    `;

    const range = div.querySelector(`#${SLIDER_ID}-range`);
    const valueDisplay = div.querySelector(`#${SLIDER_ID}-value`);
    range.addEventListener('input', function() {
      const val = this.value;
      valueDisplay.textContent = val;
      window.pakeSetZoom(val);
    });

    document.body.appendChild(div);
    sliderEl = div;
    return div;
  }

  window.pakeZoomMinus = function() {
    const current = parseInt(window.localStorage.getItem("htmlZoom") || (window.pakeConfig?.zoom || 100));
    const newZoom = Math.max(30, current - 10);
    window.pakeSetZoom(newZoom);
    if (document.getElementById(SLIDER_ID)) {
      document.getElementById(SLIDER_ID + '-range').value = newZoom;
      document.getElementById(SLIDER_ID + '-value').textContent = newZoom;
    }
  };

  window.pakeZoomPlus = function() {
    const current = parseInt(window.localStorage.getItem("htmlZoom") || (window.pakeConfig?.zoom || 100));
    const newZoom = Math.min(200, current + 10);
    window.pakeSetZoom(newZoom);
    if (document.getElementById(SLIDER_ID)) {
      document.getElementById(SLIDER_ID + '-range').value = newZoom;
      document.getElementById(SLIDER_ID + '-value').textContent = newZoom;
    }
  };

  window.pakeSetZoom = function(val) {
    setZoom(val + '%');
    window.localStorage.setItem("htmlZoom", val + '%');
    if (window.pakeUpdateZoomBtn) window.pakeUpdateZoomBtn(val);
  };

  window.pakeZoomToggle = function() {
    const existing = document.getElementById(SLIDER_ID);
    if (existing) { existing.remove(); sliderEl = null; }
    else { createZoomSlider(); }
  };

  // Ctrl+Z to toggle zoom slider
  document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.shiftKey && e.key === "Z") {
      e.preventDefault();
      window.pakeZoomToggle();
    }
  });

  // Auto-open slider on Ctrl+Z press
})();

// SUPER ROBUST FLOATING ZOOM BUTTON
(function() {
  var FLOAT_ID = "pake-zoom-btn-fixed";
  var created = false;
  
  function makeButton() {
    try {
      var existing = document.getElementById(FLOAT_ID);
      if (existing) existing.parentNode.removeChild(existing);
      
      var zoom = 100;
      try {
        var stored = window.localStorage.getItem("htmlZoom");
        if (stored) zoom = parseInt(stored);
        else if (window.pakeConfig && window.pakeConfig.zoom) zoom = window.pakeConfig.zoom;
      } catch(e) {}
      
      var btn = document.createElement("div");
      btn.id = FLOAT_ID;
      btn.style.cssText = "position:fixed!important;bottom:20px!important;right:20px!important;width:56px!important;height:56px!important;background:#5865F2!important;border-radius:50%!important;display:flex!important;align-items:center!important;justify-content:center!important;cursor:pointer!important;z-index:2147483647!important;box-shadow:0 4px 20px rgba(88,101,242,0.5)!important;font-family:Segoe UI,Roboto,sans-serif!important;color:#fff!important;font-size:14px!important;font-weight:700!important;pointer-events:auto!important;";
      btn.innerHTML = "<span style=\"color:#fff!important;font-size:15px!important;font-weight:800!important;text-shadow:0 1px 3px rgba(0,0,0,0.3)\">" + zoom + "%</span>";
      btn.onclick = function() { window.pakeZoomSlider(); };
      
      document.documentElement.appendChild(btn);
      created = true;
    } catch(e) {
      console.log("Zoom button error:", e);
    }
  }
  
  window.pakeUpdateZoomBtn = function(z) {
    var btn = document.getElementById(FLOAT_ID);
    if (btn) btn.innerHTML = "<span style=\"color:#fff!important;font-size:15px!important;font-weight:800!important;text-shadow:0 1px 3px rgba(0,0,0,0.3)\">" + z + "%</span>";
  };
  
  // Try multiple times with delays
  function attempt() {
    if (!created) makeButton();
  }
  
  setTimeout(attempt, 100);
  setTimeout(attempt, 500);
  setTimeout(attempt, 1000);
  setTimeout(attempt, 2000);
  
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() { setTimeout(attempt, 100); });
  }
  
  // Mutation observer to catch when body is added
  try {
    var obs = new MutationObserver(function() {
      if (!created) attempt();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  } catch(e) {}
})();
