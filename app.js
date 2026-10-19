// Элементы интерфейса
const imageLoader = document.getElementById("imageLoader");
const complexitySelect = document.getElementById("complexity");
const colorCountSelect = document.getElementById("colorCount");
const previewContainer = document.getElementById("preview-container");
const paletteContainer = document.getElementById("palette");
const canvasWrapper = document.getElementById("canvas-wrapper");

// Элементы модального окна кадрирования
const cropModal = document.getElementById("cropModal");
const cropCanvas = document.getElementById("cropCanvas");
const cropCtx = cropCanvas.getContext("2d");
const cropFrame = document.getElementById("cropFrame");
const confirmCropBtn = document.getElementById("confirmCropBtn");
const cancelCropBtn = document.getElementById("cancelCropBtn");

// Игровой холст отображения
const resultCanvas = document.getElementById("resultCanvas");
const resultCtx = resultCanvas.getContext("2d");

// Состояние игры
let originalImage = null;
let selectedColorIndex = 0;
let colorPalette = [];
let gridWidth = 0;
let gridHeight = 0;
let pixelDisplaySize = 16; // Базовый физический размер пикселя на холсте
let pixelsMatrix = [];

// Состояние Системы Зума и Панорамирования (Zoom & Pan)
let zoomScale = 1.0;
let panX = 0;
let panY = 0;
let isPanning = false;
let startPanX = 0;
let startPanY = 0;
let isSpacePressed = false;

// Переменные кадрирования
let isDragging = false;
let isResizing = false;
let startX, startY, startLeft, startTop, startWidth, startHeight;

// Слушатели событий
imageLoader.addEventListener("change", handleImageUpload);
cancelCropBtn.addEventListener("click", () =>
    cropModal.classList.remove("active"),
);
confirmCropBtn.addEventListener("click", confirmCrop);

// Отслеживание нажатия пробела для перемещения
window.addEventListener("keydown", (e) => {
    if (e.code === "Space") isSpacePressed = true;
});
window.addEventListener("keyup", (e) => {
    if (e.code === "Space") isSpacePressed = false;
});

// --- 1. ЗАГРУЗКА ИЗОБРАЖЕНИЯ И ОТКРЫТИЕ МОДАЛКИ ---
function handleImageUpload(e) {
    if (!e.target || !e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    const reader = new FileReader();

    reader.onload = function (event) {
        originalImage = new Image();
        originalImage.onload = function () {
            initCropModal();
        };
        originalImage.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function initCropModal() {
    const maxModalWidth = 500;
    let w = originalImage.width;
    let h = originalImage.height;

    if (w > maxModalWidth) {
        h = (maxModalWidth / w) * h;
        w = maxModalWidth;
    }

    cropCanvas.width = w;
    cropCanvas.height = h;

    cropCtx.clearRect(0, 0, w, h);
    cropCtx.drawImage(originalImage, 0, 0, w, h);

    const frameSize = Math.min(w, h) * 0.7;
    cropFrame.style.width = `${frameSize}px`;
    cropFrame.style.height = `${frameSize}px`;
    cropFrame.style.left = `${(w - frameSize) / 2}px`;
    cropFrame.style.top = `${(h - frameSize) / 2}px`;

    initCropDragEvents();
    cropModal.classList.add("active");
}

function initCropDragEvents() {
    cropFrame.onmousedown = function (e) {
        e.preventDefault();
        const rect = cropFrame.getBoundingClientRect();

        if (e.clientX > rect.right - 15 && e.clientY > rect.bottom - 15) {
            isResizing = true;
        } else {
            isDragging = true;
        }

        startX = e.clientX;
        startY = e.clientY;
        startLeft = parseFloat(cropFrame.style.left) || 0;
        startTop = parseFloat(cropFrame.style.top) || 0;
        startWidth = parseFloat(cropFrame.style.width);
        startHeight = parseFloat(cropFrame.style.height);

        document.onmousemove = function (moveEvent) {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            const containerRect = cropCanvas.getBoundingClientRect();

            if (isDragging) {
                let newLeft = startLeft + dx;
                let newTop = startTop + dy;

                newLeft = Math.max(
                    0,
                    Math.min(newLeft, containerRect.width - startWidth),
                );
                newTop = Math.max(
                    0,
                    Math.min(newTop, containerRect.height - startHeight),
                );

                cropFrame.style.left = `${newLeft}px`;
                cropFrame.style.top = `${newTop}px`;
            } else if (isResizing) {
                let side = Math.max(50, startWidth + dx);
                side = Math.min(
                    side,
                    containerRect.width - startLeft,
                    containerRect.height - startTop,
                );

                cropFrame.style.width = `${side}px`;
                cropFrame.style.height = `${side}px`;
            }
        };

        document.onmouseup = function () {
            isDragging = false;
            isResizing = false;
            document.onmousemove = null;
            document.onmouseup = null;
        };
    };
}

function confirmCrop() {
    cropModal.classList.remove("active");

    const fl = parseFloat(cropFrame.style.left) || 0;
    const ft = parseFloat(cropFrame.style.top) || 0;
    const fs = parseFloat(cropFrame.style.width) || cropCanvas.width;

    const scale = originalImage.width / cropCanvas.width;
    const origX = fl * scale;
    const origY = ft * scale;
    const origSize = fs * scale;

    processPixelArt(origX, origY, origSize);
}

function getClosestPaletteColor(rawColorStr, palette) {
    const rgbRaw = rawColorStr.match(/\d+/g).map(Number);
    let minDistance = Infinity;
    let closestColor = palette[0] || "rgb(0,0,0)";

    palette.forEach((pColor) => {
        const rgbPal = pColor.match(/\d+/g).map(Number);
        const dist = Math.sqrt(
            Math.pow(rgbRaw[0] - rgbPal[0], 2) +
                Math.pow(rgbRaw[1] - rgbPal[1], 2) +
                Math.pow(rgbRaw[2] - rgbPal[2], 2),
        );
        if (dist < minDistance) {
            minDistance = dist;
            closestColor = pColor;
        }
    });
    return closestColor;
}

// --- 2. ГЕНЕРАЦИЯ ДАННЫХ ДЛЯ ИГРЫ ---
function processPixelArt(x, y, size) {
    gridWidth = parseInt(complexitySelect.value);
    gridHeight = gridWidth;
    const maxColors = parseInt(colorCountSelect.value);

    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");
    tempCanvas.width = gridWidth;
    tempCanvas.height = gridHeight;

    tempCtx.imageSmoothingEnabled = false;
    tempCtx.drawImage(
        originalImage,
        x,
        y,
        size,
        size,
        0,
        0,
        gridWidth,
        gridHeight,
    );

    const imgData = tempCtx.getImageData(0, 0, gridWidth, gridHeight).data;
    const rawColors = [];
    const quantizedColors = [];

    for (let i = 0; i < imgData.length; i += 4) {
        if (imgData[i + 3] < 128) {
            rawColors.push("rgb(255,255,255)");
            quantizedColors.push("rgb(255,255,255)");
            continue;
        }

        let r = imgData[i];
        let g = imgData[i + 1];
        let b = imgData[i + 2];
        rawColors.push(`rgb(${r},${g},${b})`);

        let qr = Math.min(255, Math.round(r / 24) * 24);
        let qg = Math.min(255, Math.round(g / 24) * 24);
        let qb = Math.min(255, Math.round(b / 24) * 24);
        quantizedColors.push(`rgb(${qr},${qg},${qb})`);
    }

    const colorCounts = {};
    quantizedColors.forEach((c) => {
        if (c !== "rgb(255,255,255)") {
            colorCounts[c] = (colorCounts[c] || 0) + 1;
        }
    });

    colorPalette = Object.keys(colorCounts)
        .sort((a, b) => colorCounts[b] - colorCounts[a])
        .slice(0, maxColors);

    if (colorPalette.length === 0) colorPalette.push("rgb(0,0,0)");

    pixelsMatrix = rawColors.map((c) => {
        if (c === "rgb(255,255,255)") {
            return { requiredColorIdx: -1, isColored: true };
        }
        let idx = colorPalette.indexOf(c);
        if (idx === -1) {
            let closest = getClosestPaletteColor(c, colorPalette);
            idx = colorPalette.indexOf(closest);
        }
        return { requiredColorIdx: idx, isColored: false };
    });

    initGameUI();
}

// --- 3. ИНИЦИАЛИЗАЦИЯ ИГРОВОГО ИНТЕРФЕЙСА С УВЕЛИЧЕННЫМИ КЛЕТКАМИ ---
function initGameUI() {
    selectedColorIndex = 0;
    zoomScale = 1.0;

    // Увеличиваем базовый размер клетки до 32px, чтобы цифры внутри были крупными
    pixelDisplaySize = 32;

    const totalCanvasSize = gridWidth * pixelDisplaySize;
    const wrapperRect = canvasWrapper.getBoundingClientRect();

    // Центрируем увеличенный холст в рабочей области
    panX = (wrapperRect.width - totalCanvasSize) / 2;
    panY = (wrapperRect.height - totalCanvasSize) / 2;

    renderPalette();

    resultCanvas.width = totalCanvasSize;
    resultCanvas.height = totalCanvasSize;

    initZoomAndPanEvents();
    updateTransform();
    previewContainer.classList.remove("hidden");
    drawCanvas();
}

function renderPalette() {
    paletteContainer.innerHTML = "";
    colorPalette.forEach((color, index) => {
        const item = document.createElement("div");
        item.className = `color-item ${index === selectedColorIndex ? "selected" : ""}`;
        item.style.backgroundColor = color;
        item.innerText = index + 1;

        item.onclick = () => {
            document
                .querySelectorAll(".color-item")
                .forEach((el) => el.classList.remove("selected"));
            item.classList.add("selected");
            selectedColorIndex = index;
            drawCanvas(); // Перерисовываем холст для обновления подсветки и номеров
        };
        paletteContainer.appendChild(item);
    });
}

// Применение координат смещения и масштаба к Canvas
function updateTransform() {
    resultCanvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
}
// Переменная для отслеживания состояния рисования (зажатия ЛКМ)
let isDrawingMode = false;

// --- 4. СИСТЕМА УПРАВЛЕНИЯ ВИДОМ И НЕПРЕРЫВНОГО РИСОВАНИЯ ---
function initZoomAndPanEvents() {
    // 1. Приближение/отдаление колесиком в точку курсора
    canvasWrapper.onwheel = function (e) {
        e.preventDefault();
        const zoomFactor = 1.1;
        const oldScale = zoomScale;

        if (e.deltaY < 0) {
            zoomScale = Math.min(25, zoomScale * zoomFactor); // Макс зум x25
        } else {
            zoomScale = Math.max(0.2, zoomScale / zoomFactor); // Мин зум x0.2
        }

        const rect = canvasWrapper.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        panX = mouseX - (mouseX - panX) * (zoomScale / oldScale);
        panY = mouseY - (mouseY - panY) * (zoomScale / oldScale);

        updateTransform();
        drawCanvas();
    };

    // 2. Нажатие кнопок мыши
    resultCanvas.onmousedown = function (e) {
        if (e.button === 0 && !isSpacePressed) {
            // Активируем режим непрерывного рисования при зажатии левой кнопки мыши
            isDrawingMode = true;
            handleCanvasClick(e); // Закрашиваем первый пиксель сразу при клике
        } else if (
            e.button === 1 ||
            isSpacePressed ||
            e.target === canvasWrapper
        ) {
            // Перетаскивание холста (колесико или пробел)
            isPanning = true;
            startPanX = e.clientX - panX;
            startPanY = e.clientY - panY;
            e.preventDefault();
        }
    };

    // Отдельный обработчик для клика по пустому фону вокруг холста (чтобы можно было тащить зажав ЛКМ на фоне)
    canvasWrapper.onmousedown = function (e) {
        if (e.target === canvasWrapper && (e.button === 0 || e.button === 1)) {
            isPanning = true;
            startPanX = e.clientX - panX;
            startPanY = e.clientY - panY;
            e.preventDefault();
        }
    };

    // 3. Движение мыши (рисование или панорамирование)
    document.onmousemove = function (e) {
        if (isPanning) {
            panX = e.clientX - startPanX;
            panY = e.clientY - startPanY;
            updateTransform();
        } else if (isDrawingMode && !isSpacePressed) {
            // Если зажата ЛКМ — красим пиксели на лету при ведении курсора
            handleCanvasClick(e);
        }
    };

    // 4. Отжатие кнопок мыши
    document.onmouseup = function () {
        isPanning = false;
        isDrawingMode = false; // Отключаем рисование, когда кнопка отпущена
    };
}

// --- 5. ОТРИСОВКА ХОЛСТА (УВЕЛИЧЕННЫЕ КЛЕТКИ И ЧЁТКИЙ ШРИФТ) ---
function drawCanvas() {
    resultCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);

    // Текущий визуальный размер одной ячейки на экране с учетом зума
    const currentViewPixelSize = pixelDisplaySize * zoomScale;

    for (let y = 0; y < gridHeight; y++) {
        for (let x = 0; x < gridWidth; x++) {
            const index = y * gridWidth + x;
            const p = pixelsMatrix[index];
            const px = x * pixelDisplaySize;
            const py = y * pixelDisplaySize;

            if (p.isColored) {
                resultCtx.fillStyle =
                    p.requiredColorIdx === -1
                        ? "#ffffff"
                        : colorPalette[p.requiredColorIdx];
                resultCtx.fillRect(px, py, pixelDisplaySize, pixelDisplaySize);
            } else {
                // Выделение не окрашенных областей выбранного цвета
                if (p.requiredColorIdx === selectedColorIndex) {
                    resultCtx.fillStyle = "#cbd5e1"; // Контрастный серый цвет
                } else {
                    resultCtx.fillStyle = "#ffffff"; // Обычный белый
                }
                resultCtx.fillRect(px, py, pixelDisplaySize, pixelDisplaySize);

                // Сетка (рисуется всегда, если ячейка крупнее 3px на экране)
                if (currentViewPixelSize > 3) {
                    resultCtx.strokeStyle = "#cbd5e1";
                    resultCtx.lineWidth = 0.5;
                    resultCtx.strokeRect(
                        px,
                        py,
                        pixelDisplaySize,
                        pixelDisplaySize,
                    );
                }

                // Отрисовка цифр (появляются, если размер клетки на экране больше 14px)
                if (currentViewPixelSize > 14) {
                    // Делаем цвет шрифта максимально контрастным и разборчивым
                    resultCtx.fillStyle =
                        p.requiredColorIdx === selectedColorIndex
                            ? "#0f172a"
                            : "#64748b";

                    // Рассчитываем размер шрифта (примерно 45% от физического размера клетки)
                    const fontSize = Math.floor(pixelDisplaySize * 0.45);
                    resultCtx.font = `bold ${fontSize}px sans-serif`;
                    resultCtx.textBaseline = "middle";
                    resultCtx.textAlign = "center";

                    // Рисуем номер строго по центру ячейки
                    resultCtx.fillText(
                        p.requiredColorIdx + 1,
                        px + pixelDisplaySize / 2,
                        py + pixelDisplaySize / 2,
                    );
                }
            }
        }
    }
}

// --- 6. ЛОГИКА НАЖАТИЯ И ЗАКРАШИВАНИЯ ---
function handleCanvasClick(e) {
    const rect = resultCanvas.getBoundingClientRect();

    // Расчет клика с учетом текущего масштаба Canvas
    const clickX = (e.clientX - rect.left) / zoomScale;
    const clickY = (e.clientY - rect.top) / zoomScale;

    const gridX = Math.floor(clickX / pixelDisplaySize);
    const gridY = Math.floor(clickY / pixelDisplaySize);

    if (gridX >= 0 && gridX < gridWidth && gridY >= 0 && gridY < gridHeight) {
        const index = gridY * gridWidth + gridX;
        const p = pixelsMatrix[index];

        if (!p.isColored && p.requiredColorIdx === selectedColorIndex) {
            p.isColored = true;
            drawCanvas(); // Перерисовываем холст, чтобы убрать серую подсветку с закрашенного пикселя
            checkWinState();
        }
    }
}

function checkWinState() {
    const hasUnfinished = pixelsMatrix.some((p) => !p.isColored);
    if (!hasUnfinished) {
        setTimeout(
            () =>
                alert(
                    "Поздравляем! Это шедевр! Картинка полностью раскрашена! 🏆🎨🎉",
                ),
            100,
        );
    }
}
