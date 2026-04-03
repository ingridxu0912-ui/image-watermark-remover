// 全局变量
let canvas = document.getElementById('canvas');
let ctx = canvas.getContext('2d');
let uploadArea = document.getElementById('uploadArea');
let fileInput = document.getElementById('fileInput');
let canvasContainer = document.getElementById('canvasContainer');
let loadingOverlay = document.getElementById('loadingOverlay');
let loadingText = document.getElementById('loadingText');
let undoBtn = document.getElementById('undoBtn');
let clearBtn = document.getElementById('clearBtn');
let processBtn = document.getElementById('processBtn');
let downloadContainer = document.getElementById('downloadContainer');
let downloadBtn = document.getElementById('downloadBtn');

let currentTool = 'rect';
let brushSize = 15;
let isDrawing = false;
let startX = 0;
let startY = 0;
let maskCanvas = null;
let maskCtx = null;
let originalImage = null;
let history = [];
let cv = null;
let opencvLoaded = false;

// 工具选择
document.querySelectorAll('.tool-radio').forEach(radio => {
  radio.addEventListener('change', (e) => {
    currentTool = e.target.value;
    document.getElementById('brushSizeContainer').style.display = currentTool === 'brush' ? 'block' : 'none';
  });
});

// 画笔大小
document.getElementById('brushSize').addEventListener('input', (e) => {
  brushSize = parseInt(e.target.value);
  document.getElementById('brushSizeValue').textContent = brushSize;
});

// 上传事件
uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('border-blue-500');
});
uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('border-blue-500');
});
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('border-blue-500');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    loadImage(file);
  }
});
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    loadImage(file);
  }
});

// 加载图片
function loadImage(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      // 限制最大尺寸
      const maxSize = 4096;
      let width = img.width;
      let height = img.height;
      
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      
      // 创建遮罩画布
      if (!maskCanvas) {
        maskCanvas = document.createElement('canvas');
      }
      maskCanvas.width = width;
      maskCanvas.height = height;
      maskCtx = maskCanvas.getContext('2d');
      maskCtx.clearRect(0, 0, width, height);
      
      originalImage = ctx.getImageData(0, 0, width, height);
      history = [];
      updateButtons();
      
      uploadArea.style.display = 'none';
      canvasContainer.style.display = 'block';
      downloadContainer.style.display = 'none';
      
      // 加载 OpenCV
      if (!opencvLoaded) {
        loadOpenCV();
      }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// 加载 OpenCV.js
function loadOpenCV() {
  loadingOverlay.classList.remove('hidden');
  loadingOverlay.style.display = 'flex';
  loadingText.textContent = '正在加载 OpenCV...';
  
  const script = document.createElement('script');
  script.src = 'https://docs.opencv.org/4.8.0/opencv.js';
  script.onload = () => {
    if (window.cv) {
      window.cv.onRuntimeInitialized = () => {
        cv = window.cv;
        opencvLoaded = true;
        loadingOverlay.classList.add('hidden');
        loadingOverlay.style.display = 'none';
        processBtn.disabled = false;
      };
    } else {
      // 如果已经初始化完成
      cv = window.cv;
      opencvLoaded = true;
      loadingOverlay.classList.add('hidden');
      loadingOverlay.style.display = 'none';
      processBtn.disabled = false;
    }
  };
  script.onerror = () => {
    loadingText.textContent = '加载失败，请刷新页面重试';
  };
  document.body.appendChild(script);
}

// 鼠标事件
canvas.addEventListener('mousedown', (e) => {
  if (!maskCtx) return;
  isDrawing = true;
  const rect = canvas.getBoundingClientRect();
  startX = e.clientX - rect.left;
  startY = e.clientY - rect.top;
  
  // 保存历史用于撤销
  saveHistory();
  
  if (currentTool === 'brush') {
    drawBrush(startX, startY);
  }
});

canvas.addEventListener('mousemove', (e) => {
  if (!isDrawing || !maskCtx) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  if (currentTool === 'brush') {
    drawBrush(x, y);
  } else if (currentTool === 'rect') {
    // 重绘原图并重新绘制所有历史标记加上当前矩形预览
    ctx.putImageData(originalImage, 0, 0);
    drawMask();
    ctx.strokeStyle = 'rgba(0, 120, 255, 1)';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(0, 120, 255, 0.3)';
    ctx.fillRect(startX, startY, x - startX, y - startY);
    ctx.strokeRect(startX, startY, x - startX, y - startY);
  }
});

canvas.addEventListener('mouseup', (e) => {
  if (!isDrawing || !maskCtx) return;
  isDrawing = false;
  const rect = canvas.getBoundingClientRect();
  const endX = e.clientX - rect.left;
  const endY = e.clientY - rect.top;
  
  if (currentTool === 'rect') {
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);
    
    // 在遮罩上填充矩形
    maskCtx.fillStyle = 'white';
    maskCtx.fillRect(minX, minY, maxX - minX, maxY - minY);
    
    // 重绘
    ctx.putImageData(originalImage, 0, 0);
    drawMask();
    updateButtons();
  }
});

function drawBrush(x, y) {
  maskCtx.fillStyle = 'white';
  maskCtx.beginPath();
  maskCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
  maskCtx.fill();
  
  ctx.putImageData(originalImage, 0, 0);
  drawMask();
  updateButtons();
}

// 绘制遮罩半透明高亮
function drawMask() {
  const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = 'rgba(0, 120, 255, 0.5)';
  for (let y = 0; y < maskCanvas.height; y++) {
    for (let x = 0; x < maskCanvas.width; x++) {
      const index = (y * maskCanvas.width + x) * 4 + 3;
      if (maskData.data[index] > 0) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  ctx.globalAlpha = 1.0;
}

// 保存历史
function saveHistory() {
  history.push(maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height));
}

// 撤销
undoBtn.addEventListener('click', () => {
  if (history.length === 0) return;
  const last = history.pop();
  maskCtx.putImageData(last, 0, 0);
  ctx.putImageData(originalImage, 0, 0);
  drawMask();
  updateButtons();
});

// 清空
clearBtn.addEventListener('click', () => {
  saveHistory();
  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  ctx.putImageData(originalImage, 0, 0);
  updateButtons();
});

function updateButtons() {
  undoBtn.disabled = history.length === 0;
  clearBtn.disabled = isMaskEmpty();
  processBtn.disabled = !opencvLoaded || isMaskEmpty();
}

function isMaskEmpty() {
  if (!maskCtx) return true;
  const imageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
  for (let i = 3; i < imageData.data.length; i += 4) {
    if (imageData.data[i] > 0) return false;
  }
  return true;
}

// 处理图片
processBtn.addEventListener('click', () => {
  if (!opencvLoaded || !maskCtx) return;
  
  loadingOverlay.classList.remove('hidden');
  loadingOverlay.style.display = 'flex';
  loadingText.textContent = '正在去除水印...';
  
  // 使用 requestAnimationFrame 让 UI 更新
  requestAnimationFrame(() => {
    processImage();
  });
});

function processImage() {
  try {
    // 获取原图和遮罩
    const src = cv.imread(canvas);
    const mask = cv.imread(maskCanvas);
    
    // 转为灰度图作为遮罩
    let grayMask = new cv.Mat();
    cv.cvtColor(mask, grayMask, cv.COLOR_RGBA2GRAY);
    
    // 创建输出
    const dst = new cv.Mat();
    
    // 使用 Telea 算法修复
    cv.inpaint(src, grayMask, dst, 3, cv.INPAINT_TELEA);
    
    // 将结果绘制到 canvas
    cv.imshow(canvas, dst);
    
    // 释放内存
    src.delete();
    mask.delete();
    grayMask.delete();
    dst.delete();
    
    // 准备下载
    prepareDownload();
    
    loadingOverlay.classList.add('hidden');
    loadingOverlay.style.display = 'none';
  } catch (error) {
    console.error(error);
    loadingText.textContent = '处理失败: ' + error.message;
    setTimeout(() => {
      loadingOverlay.classList.add('hidden');
      loadingOverlay.style.display = 'none';
    }, 3000);
  }
}

function prepareDownload() {
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    downloadBtn.href = url;
    downloadBtn.download = 'removed-watermark.png';
    downloadContainer.style.display = 'block';
  }, 'image/png');
}

// 下载
downloadBtn.addEventListener('click', () => {
  // 点击后由浏览器处理
});
