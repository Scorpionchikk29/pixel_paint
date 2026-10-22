// Элементы интерфейса
const imageLoader = document.getElementById("imageLoader");
const complexitySelect = document.getElementById("complexity");
const colorCountSelect = document.getElementById("colorCount");
const directLoadJsonBtn = document.getElementById("directLoadJsonBtn");
const previewContainer = document.getElementById("preview-container");
const paletteContainer = document.getElementById("palette");
const canvasWrapper = document.getElementById("canvas-wrapper");

// Новые элементы сохранения
const saveProgressBtn = document.getElementById("saveProgressBtn");
const loadProgressBtn = document.getElementById("loadProgressBtn");
const resetProgressBtn = document.getElementById("resetProgressBtn");
const progressFileLoader = document.getElementById("progressFileLoader");

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
let pixelDisplaySize = 32;
let pixelsMatrix = [];

// Состояние Системы Зума и Панорамирования
let zoomScale = 1.0;
let panX = 0;
let panY = 0;
let isPanning = false;
let startPanX = 0;
let startPanY = 0;
let isSpacePressed = false;
let isDrawingMode = false;

// Переменные кадрирования
let isDragging = false;
let isResizing = false;
let startX, startY, startLeft, startTop, startWidth, startHeight;

// Ключ для LocalStorage
const STORAGE_KEY = "pixel_coloring_save_v1";

// Слушатели событий
imageLoader.addEventListener("change", handleImageUpload);
cancelCropBtn.addEventListener("click", () =>
    cropModal.classList.remove("active"),
);
confirmCropBtn.addEventListener("click", confirmCrop);
directLoadJsonBtn.addEventListener("click", () => progressFileLoader.click());

// Управление сохранениями
saveProgressBtn.addEventListener("click", exportSaveToFile);
loadProgressBtn.addEventListener("click", () => progressFileLoader.click());
progressFileLoader.addEventListener("change", importSaveFromFile);
resetProgressBtn.addEventListener("click", resetCurrentProgress);

window.addEventListener("keydown", (e) => {
    if (e.code === "Space") isSpacePressed = true;
});
window.addEventListener("keyup", (e) => {
    if (e.code === "Space") isSpacePressed = false;
});

// Проверка автосохранения при старте страницы
document.addEventListener("DOMContentLoaded", checkLocalStorageSave);

// --- СИСТЕМА АВТОСОХРАНЕНИЯ И ЗАГРУЗКИ ---

// Проверка наличия старого сохранения в браузере
function checkLocalStorageSave() {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
        try {
            const data = JSON.parse(savedData);
            if (
                confirm(
                    "Найдена неоконченная раскраска! Восстановить ваш прогресс?",
                )
            ) {
                loadGameState(data);
            } else {
                localStorage.removeItem(STORAGE_KEY);
            }
        } catch (e) {
            console.error("Ошибка чтения автосохранения", e);
        }
    }
}

// Автоматическое сохранение состояния в LocalStorage
function autoSaveToLocalStorage() {
    // Сохраняем полную карту индексов цветов и их статус закраски
    const matrixData = pixelsMatrix.map((p) => ({
        c: p.requiredColorIdx, // сохраняем оригинальный индекс цвета
        v: p.isColored ? 1 : 0, // сохраняем статус (1 - закрашен, 0 - пустой)
    }));

    const saveData = {
        gridWidth,
        gridHeight,
        colorPalette,
        pixelDisplaySize,
        matrixData: matrixData,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(saveData));
}

// Восстановление игры из объекта данных
function loadGameState(data) {
    gridWidth = data.gridWidth;
    gridHeight = data.gridHeight;
    colorPalette = data.colorPalette;
    pixelDisplaySize = data.pixelDisplaySize || 32;

    // Точечно восстанавливаем каждый пиксель с его законным цветом и статусом
    pixelsMatrix = data.matrixData.map((item) => ({
        requiredColorIdx: item.c,
        isColored: item.v === 1,
    }));

    // Инициализируем интерфейс из сохранения
    initGameUIFromSave();
}

function initGameUIFromSave() {
    selectedColorIndex = 0;
    zoomScale = 1.0;

    previewContainer.classList.remove("hidden");

    setTimeout(() => {
        const wrapperRect = canvasWrapper.getBoundingClientRect();
        const totalCanvasSize = gridWidth * pixelDisplaySize;

        // Позиционируем холст по центру экрана
        panX = (wrapperRect.width - totalCanvasSize) / 2;
        panY = (wrapperRect.height - totalCanvasSize) / 2;

        renderPalette();

        resultCanvas.width = totalCanvasSize;
        resultCanvas.height = totalCanvasSize;

        initZoomAndPanEvents();
        updateTransform();
        drawCanvas();
        updateProgressBar();
        renderPalette();
    }, 50);
}

// Экспорт прогресса в .json файл (для скачивания)
function exportSaveToFile() {
    const matrixData = pixelsMatrix.map((p) => ({
        c: p.requiredColorIdx,
        v: p.isColored ? 1 : 0,
    }));

    const saveData = {
        gridWidth,
        gridHeight,
        colorPalette,
        pixelDisplaySize,
        matrixData: matrixData,
    };

    const blob = new Blob([JSON.stringify(saveData)], {
        type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pixel-art-progress-${gridWidth}x${gridHeight}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// Импорт прогресса из .json файла
function importSaveFromFile(e) {
    // Проверяем, что файл действительно выбран
    if (!e.target || !e.target.files || e.target.files.length === 0) {
        return;
    }

    // Извлекаем строго первый файл из списка (индекс 0)
    const file = e.target.files[0];
    const reader = new FileReader();

    reader.onload = function (event) {
        try {
            const data = JSON.parse(event.target.result);
            gridWidth = data.gridWidth;
            gridHeight = data.gridHeight;
            colorPalette = data.colorPalette;
            pixelDisplaySize = data.pixelDisplaySize || 32;

            pixelsMatrix = data.matrixData.map((item) => ({
                requiredColorIdx: item.c,
                isColored: item.v === 1,
            }));

            initGameUIFromSave();
            autoSaveToLocalStorage();
            alert("Прогресс успешно загружен из файла!");
        } catch (err) {
            alert("Ошибка: Некорректный файл сохранения.");
        }
    };

    reader.readAsText(file);
}

// Сброс текущей раскраски
function resetCurrentProgress() {
    if (
        confirm(
            "Вы уверены, что хотите полностью стереть текущий прогресс раскрашивания?",
        )
    ) {
        pixelsMatrix.forEach((p) => {
            if (p.requiredColorIdx !== -1) p.isColored = false;
        });
        autoSaveToLocalStorage();
        drawCanvas();
        updateProgressBar();
        renderPalette();
    }
}

// --- СТАНДАРТНАЯ ЛОГИКА ЗАГРУЗКИ КАРТИНКИ ---

function handleImageUpload(e) {
    // Проверяем, что событие сработало корректно и пользователь выбрал хотя бы один файл
    if (!e.target || !e.target.files || e.target.files.length === 0) {
        return;
    }

    // Извлекаем строго первый файл из списка выбранных
    const file = e.target.files[0];
    const reader = new FileReader();

    reader.onload = function (event) {
        originalImage = new Image();
        originalImage.onload = function () {
            initCropModal();
        };
        originalImage.src = event.target.result;
    };

    // Передаем одиночный файл, что полностью устраняет ошибку типа 'Blob'
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
        if (e.clientX > rect.right - 15 && e.clientY > rect.bottom - 15)
            isResizing = true;
        else isDragging = true;
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
                let newLeft = Math.max(
                    0,
                    Math.min(startLeft + dx, containerRect.width - startWidth),
                );
                let newTop = Math.max(
                    0,
                    Math.min(startTop + dy, containerRect.height - startHeight),
                );
                cropFrame.style.left = `${newLeft}px`;
                cropFrame.style.top = `${newTop}px`;
            } else if (isResizing) {
                let side = Math.min(
                    Math.max(50, startWidth + dx),
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
        };
    };
}

function confirmCrop() {
    cropModal.classList.remove("active");
    const fl = parseFloat(cropFrame.style.left) || 0;
    const ft = parseFloat(cropFrame.style.top) || 0;
    const fs = parseFloat(cropFrame.style.width) || cropCanvas.width;
    const scale = originalImage.width / cropCanvas.width;
    processPixelArt(fl * scale, ft * scale, fs * scale);
}

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
        quantizedColors.push(
            `rgb(${Math.min(255, Math.round(r / 24) * 24)},${Math.min(255, Math.round(g / 24) * 24)},${Math.min(255, Math.round(b / 24) * 24)})`,
        );
    }

    const colorCounts = {};
    quantizedColors.forEach((c) => {
        if (c !== "rgb(255,255,255)")
            colorCounts[c] = (colorCounts[c] || 0) + 1;
    });

    colorPalette = Object.keys(colorCounts)
        .sort((a, b) => colorCounts[b] - colorCounts[a])
        .slice(0, maxColors);
    if (colorPalette.length === 0) colorPalette.push("rgb(0,0,0)");

    pixelsMatrix = rawColors.map((c) => {
        if (c === "rgb(255,255,255)")
            return { requiredColorIdx: -1, isColored: true };
        let idx = colorPalette.indexOf(c);
        if (idx === -1)
            idx = colorPalette.indexOf(getClosestPaletteColor(c, colorPalette));
        return { requiredColorIdx: idx, isColored: false };
    });

    initGameUI();
    autoSaveToLocalStorage(); // Первичное автосохранение
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

function initGameUI() {
    selectedColorIndex = 0;
    zoomScale = 1.0;
    pixelDisplaySize = 32;
    const wrapperRect = canvasWrapper.getBoundingClientRect();
    const totalCanvasSize = gridWidth * pixelDisplaySize;
    panX = (wrapperRect.width - totalCanvasSize) / 2;
    panY = (wrapperRect.height - totalCanvasSize) / 2;

    renderPalette();
    resultCanvas.width = totalCanvasSize;
    resultCanvas.height = totalCanvasSize;
    initZoomAndPanEvents();
    updateTransform();
    previewContainer.classList.remove("hidden");
    drawCanvas();
    updateProgressBar();
    renderPalette();
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
            drawCanvas();
        };
        paletteContainer.appendChild(item);
    });
}

function updateTransform() {
    resultCanvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
}

function initZoomAndPanEvents() {
    canvasWrapper.onwheel = function (e) {
        e.preventDefault();
        const zoomFactor = 1.1;
        const oldScale = zoomScale;
        zoomScale =
            e.deltaY < 0
                ? Math.min(25, zoomScale * zoomFactor)
                : Math.max(0.2, zoomScale / zoomFactor);
        const rect = canvasWrapper.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        panX = mouseX - (mouseX - panX) * (zoomScale / oldScale);
        panY = mouseY - (mouseY - panY) * (zoomScale / oldScale);
        updateTransform();
        drawCanvas();
    };

    resultCanvas.onmousedown = function (e) {
        if (e.button === 0 && !isSpacePressed) {
            isDrawingMode = true;
            handleCanvasClick(e);
        } else if (
            e.button === 1 ||
            isSpacePressed ||
            e.target === canvasWrapper
        ) {
            isPanning = true;
            startPanX = e.clientX - panX;
            startPanY = e.clientY - panY;
            e.preventDefault();
        }
    };

    canvasWrapper.onmousedown = function (e) {
        if (e.target === canvasWrapper && (e.button === 0 || e.button === 1)) {
            isPanning = true;
            startPanX = e.clientX - panX;
            startPanY = e.clientY - startPanY;
            e.preventDefault();
        }
    };

    document.onmousemove = function (e) {
        if (isPanning) {
            panX = e.clientX - startPanX;
            panY = e.clientY - startPanY;
            updateTransform();
        } else if (isDrawingMode && !isSpacePressed) {
            handleCanvasClick(e);
        }
    };

    document.onmouseup = function () {
        isPanning = false;
        isDrawingMode = false;
    };
}

function drawCanvas() {
    resultCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
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
                resultCtx.fillStyle =
                    p.requiredColorIdx === selectedColorIndex
                        ? "#cbd5e1"
                        : "#ffffff";
                resultCtx.fillRect(px, py, pixelDisplaySize, pixelDisplaySize);

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
                if (currentViewPixelSize > 14) {
                    resultCtx.fillStyle =
                        p.requiredColorIdx === selectedColorIndex
                            ? "#0f172a"
                            : "#64748b";
                    const fontSize = Math.floor(pixelDisplaySize * 0.45);
                    resultCtx.font = `bold ${fontSize}px sans-serif`;
                    resultCtx.textBaseline = "middle";
                    resultCtx.textAlign = "center";
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

function handleCanvasClick(e) {
    const rect = resultCanvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / zoomScale;
    const clickY = (e.clientY - rect.top) / zoomScale;
    const gridX = Math.floor(clickX / pixelDisplaySize);
    const gridY = Math.floor(clickY / pixelDisplaySize);

    if (gridX >= 0 && gridX < gridWidth && gridY >= 0 && gridY < gridHeight) {
        const index = gridY * gridWidth + gridX;
        const p = pixelsMatrix[index];

        if (!p.isColored && p.requiredColorIdx === selectedColorIndex) {
            p.isColored = true;
            resultCtx.fillStyle = colorPalette[p.requiredColorIdx];
            resultCtx.fillRect(
                gridX * pixelDisplaySize,
                gridY * pixelDisplaySize,
                pixelDisplaySize,
                pixelDisplaySize,
            );
            autoSaveToLocalStorage();
            updateProgressBar();
            const isCurrentColorFinished = !pixelsMatrix.some(
                (pixel) =>
                    pixel.requiredColorIdx === selectedColorIndex &&
                    !pixel.isColored,
            );
            if (isCurrentColorFinished) {
                renderPalette();
            }
            checkWinState();
        }
    }
}

function checkWinState() {
    const hasUnfinished = pixelsMatrix.some((p) => !p.isColored);
    if (!hasUnfinished) {
        localStorage.removeItem(STORAGE_KEY);
        setTimeout(
            () =>
                alert(
                    "Поздравляем! Это шедевр! Картинка полностью раскрашена! 🏆🎨🎉",
                ),
            100,
        );
    }
}

// Находим кнопку в DOM (добавьте к объявлению переменных в начале файла)
const exportPngBtn = document.getElementById("exportPngBtn");

// Привязываем событие (добавьте к списку слушателей событий)
exportPngBtn.addEventListener("click", saveCanvasAsPng);

// Функция сохранения холста в формате PNG (вставьте в блок функций сохранения)
function saveCanvasAsPng() {
    // Проверяем, запущена ли игра и есть ли данные на холсте
    if (!pixelsMatrix || pixelsMatrix.length === 0) {
        alert(
            "Ошибка: Холст пуст. Сначала загрузите изображение или сохранение!",
        );
        return;
    }

    try {
        // Получаем DataURL из игрового Canvas
        const dataUrl = resultCanvas.toDataURL("image/png");

        // Создаем виртуальную ссылку для скачивания файла
        const link = document.createElement("a");
        link.download = `pixel-art-result-${gridWidth}x${gridHeight}.png`;
        link.href = dataUrl;

        // Эмулируем клик для скачивания
        link.click();
    } catch (error) {
        console.error("Не удалось сохранить изображение в PNG:", error);
        alert("Произошла ошибка при генерации PNG файла.");
    }
}

function updateProgressBar() {
    if (!pixelsMatrix || pixelsMatrix.length === 0) return;

    // Считаем пиксели, которые требуют закрашивания (исключаем белый фон с индексом -1)
    const totalPlayablePixels = pixelsMatrix.filter(
        (p) => p.requiredColorIdx !== -1,
    ).length;

    if (totalPlayablePixels === 0) {
        document.getElementById("progressBarFill").style.height = "100%";
        document.getElementById("progressText").innerText = "100%";
        return;
    }

    // Считаем, сколько из игровых пикселей уже закрашено
    const coloredPlayablePixels = pixelsMatrix.filter(
        (p) => p.requiredColorIdx !== -1 && p.isColored,
    ).length;

    // Вычисляем процент и округляем до десятых долей
    const progressPercent = (
        (coloredPlayablePixels / totalPlayablePixels) *
        100
    ).toFixed(1);

    // Плавно заполняем бар снизу вверх и обновляем текст процента рядом
    document.getElementById("progressBarFill").style.height =
        `${progressPercent}%`;
    document.getElementById("progressText").innerText = `${progressPercent}%`;
}

function renderPalette() {
    paletteContainer.innerHTML = "";

    colorPalette.forEach((color, index) => {
        const item = document.createElement("div");
        item.className = `color-item ${index === selectedColorIndex ? "selected" : ""}`;
        item.style.backgroundColor = color;

        // Проверяем, остались ли на всём поле НЕзакрашенные пиксели с этим индексом цвета
        const isColorFinished = !pixelsMatrix.some(
            (p) => p.requiredColorIdx === index && !p.isColored,
        );

        // Если цвет полностью завершён — рисуем галочку, иначе — стандартный порядковый номер
        item.innerText = isColorFinished ? "✓" : index + 1;

        // Немного стилизуем галочку для наглядности (делаем её крупнее и жирнее)
        if (isColorFinished) {
            item.style.fontSize = "16px";
            item.style.fontWeight = "900";
        } else {
            item.style.fontSize = "12px";
            item.style.fontWeight = "bold";
        }

        item.onclick = () => {
            document
                .querySelectorAll(".color-item")
                .forEach((el) => el.classList.remove("selected"));
            item.classList.add("selected");
            selectedColorIndex = index;
            drawCanvas(); // Перерисовываем холст для обновления серой подсветки
        };

        paletteContainer.appendChild(item);
    });
}
