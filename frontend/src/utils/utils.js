// src/utils/utils.js
export const downloadResource = (url, filename) => {
  if (!url) {
    console.error("URL is not provided");
    return;
  }

  // If no filename is provided, extract it from the URL
  const name = filename || url.substring(url.lastIndexOf("/") + 1);

  fetch(url)
    .then((response) => response.blob())
    .then((blob) => {
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    })
    .catch((error) => {
      console.error("Error downloading resource:", error);
    });
};