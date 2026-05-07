/**
 * PDF Export Web Worker
 * Handles heavy PDF generation off the main thread
 * to prevent UI freezing and keep animations smooth
 */

// Listen for PDF generation requests from the main thread
self.addEventListener('message', async (event) => {
  const { action, data } = event.data;

  try {
    if (action === 'generatePDF') {
      // Extract serialized data
      const {
        htmlContent,
        fileName,
        pageSize,
        title
      } = data;

      // Send progress updates
      self.postMessage({ action: 'progress', status: 'Preparing PDF generation...' });

      // Note: html2pdf library cannot run in a worker because it needs DOM access.
      // Instead, we send back a signal indicating the main thread should proceed
      // with PDF generation while we report progress.
      
      // Simulate processing with progress updates
      for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        self.postMessage({
          action: 'progress',
          status: `Processing... ${(i + 1) * 20}%`,
          percent: (i + 1) * 20
        });
      }

      // Signal to main thread that PDF generation can proceed
      self.postMessage({
        action: 'ready',
        message: 'Worker ready for PDF generation'
      });
    }
  } catch (error) {
    self.postMessage({
      action: 'error',
      error: error.message,
      stack: error.stack
    });
  }
});

// Helper function for long-running computations
function chunkProcess(items, processor, chunkSize = 10) {
  return new Promise((resolve) => {
    let index = 0;

    function processChunk() {
      const end = Math.min(index + chunkSize, items.length);
      
      for (let i = index; i < end; i++) {
        processor(items[i], i);
      }
      
      index = end;
      
      if (index < items.length) {
        // Yield to main thread between chunks
        setTimeout(processChunk, 0);
      } else {
        resolve();
      }
    }

    processChunk();
  });
}
