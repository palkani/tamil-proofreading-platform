"""
Tamil Handwriting OCR Engine using Deep Learning (optional).
Requires: torch, numpy, opencv. Place model at MODEL_PATH (e.g. models/tamil_ocr.pth).
If torch is not installed, api_server runs in preprocess+segment-only mode.
"""

import numpy as np
import cv2
from typing import List, Optional, Tuple
from pathlib import Path
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False

# Tamil character set for OCR
TAMIL_CHARS = [
    '<blank>', ' ', 'அ', 'ஆ', 'இ', 'ஈ', 'உ', 'ஊ', 'எ', 'ஏ', 'ஐ', 'ஒ', 'ஓ', 'ஔ',
    'க', 'ங', 'ச', 'ஞ', 'ட', 'ண', 'த', 'ந', 'ப', 'ம', 'ய', 'ர', 'ல', 'வ', 'ழ', 'ள', 'ற', 'ன',
    'ஜ', 'ஷ', 'ஸ', 'ஹ',
    'ா', 'ி', 'ீ', 'ு', 'ூ', 'ெ', 'ே', 'ை', 'ொ', 'ோ', 'ௌ', '்', 'ஃ',
    '௦', '௧', '௨', '௩', '௪', '௫', '௬', '௭', '௮', '௯', '௰',
    '.', ',', '?', '!', '-', ':', ';', '"', "'", '(', ')', '<unk>', '<pad>',
]
if TAMIL_CHARS[0] != '<blank>':
    TAMIL_CHARS = ['<blank>'] + [c for c in TAMIL_CHARS if c != '<blank>']
IDX_TO_CHAR = {idx: c for idx, c in enumerate(TAMIL_CHARS)}
NUM_CLASSES = len(TAMIL_CHARS)


@dataclass
class OCRResult:
    text: str
    confidence: float
    char_confidences: List[float]
    alternatives: List[Tuple[str, float]]


if TORCH_AVAILABLE:
    class TamilCRNN(nn.Module):
        def __init__(self, num_classes=NUM_CLASSES, hidden_size=256, num_layers=2, dropout=0.2):
            super().__init__()
            self.cnn = nn.Sequential(
                nn.Conv2d(1, 64, 3, padding=1), nn.BatchNorm2d(64), nn.ReLU(inplace=True), nn.MaxPool2d(2, 2),
                nn.Conv2d(64, 128, 3, padding=1), nn.BatchNorm2d(128), nn.ReLU(inplace=True), nn.MaxPool2d(2, 2),
                nn.Conv2d(128, 256, 3, padding=1), nn.BatchNorm2d(256), nn.ReLU(inplace=True),
                nn.Conv2d(256, 256, 3, padding=1), nn.BatchNorm2d(256), nn.ReLU(inplace=True), nn.MaxPool2d((2, 1), (2, 1)),
                nn.Conv2d(256, 512, 3, padding=1), nn.BatchNorm2d(512), nn.ReLU(inplace=True),
                nn.Conv2d(512, 512, 3, padding=1), nn.BatchNorm2d(512), nn.ReLU(inplace=True), nn.MaxPool2d((2, 1), (2, 1)),
                nn.Conv2d(512, 512, 2, padding=0), nn.BatchNorm2d(512), nn.ReLU(inplace=True),
            )
            self.rnn = nn.LSTM(512, hidden_size, num_layers, bidirectional=True, batch_first=True, dropout=dropout if num_layers > 1 else 0)
            self.fc = nn.Linear(hidden_size * 2, num_classes)

        def forward(self, x):
            conv = self.cnn(x)
            conv = conv.squeeze(2).permute(0, 2, 1)
            rnn_out, _ = self.rnn(conv)
            return F.log_softmax(self.fc(rnn_out), dim=2)

    class TamilOCREngine:
        def __init__(self, model_path=None, device=None, img_height=64, img_width=256):
            self.img_height = img_height
            self.img_width = img_width
            self.device = torch.device(device or ('cuda' if torch.cuda.is_available() else 'cpu'))
            self.model = TamilCRNN(num_classes=NUM_CLASSES)
            self.model.to(self.device)
            self.model.eval()
            if model_path and Path(model_path).exists():
                state_dict = torch.load(model_path, map_location=self.device)
                self.model.load_state_dict(state_dict)
                self.model.eval()
                logger.info("Loaded model from %s", model_path)
            else:
                logger.warning("No model weights loaded. Recognition will be random.")

        def preprocess_image(self, image: np.ndarray):
            if len(image.shape) == 3:
                image = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            h, w = image.shape
            new_w = min(int(w * self.img_height / h), self.img_width)
            image = cv2.resize(image, (new_w, self.img_height))
            if new_w < self.img_width:
                image = np.pad(image, ((0, 0), (0, self.img_width - new_w)), mode='constant', constant_values=0)
            tensor = torch.from_numpy(image.astype(np.float32) / 255.0).unsqueeze(0).unsqueeze(0)
            return tensor.to(self.device)

        def _greedy_decode(self, output):
            probs = output.exp()
            max_probs, indices = probs.max(dim=1)
            decoded, confidences, prev_idx = [], [], -1
            for i, idx in enumerate(indices.tolist()):
                if idx != prev_idx and idx != 0 and idx < len(IDX_TO_CHAR):
                    decoded.append(IDX_TO_CHAR[idx])
                    confidences.append(max_probs[i].item())
                prev_idx = idx
            return ''.join(decoded), (np.mean(confidences) if confidences else 0.0)

        @torch.no_grad()
        def recognize(self, image: np.ndarray, beam_width=1) -> OCRResult:
            tensor = self.preprocess_image(image)
            output = self.model(tensor).squeeze(0)
            text, confidence = self._greedy_decode(output)
            return OCRResult(text=text, confidence=confidence, char_confidences=[], alternatives=[])

    _engine = None

    def get_ocr_engine(model_path=None):
        global _engine
        if _engine is None:
            _engine = TamilOCREngine(model_path=model_path)
        return _engine
else:
    TamilOCREngine = None  # type: ignore
    get_ocr_engine = None  # type: ignore
