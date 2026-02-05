/**
 * OCR native module: heavy OCR work in C++ using Tesseract API, wrapped with pybind11.
 * Python imports this module and calls ocr_image() instead of spawning pytesseract.
 */

#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include <tesseract/baseapi.h>
#include <cstring>
#include <string>
#include <vector>
#include <memory>

namespace py = pybind11;

/**
 * Convert RGB (3 bytes per pixel) to grayscale (1 byte per pixel).
 * Gray = 0.299*R + 0.587*G + 0.114*B
 */
static void rgb_to_grayscale(
    const unsigned char* rgb,
    int width,
    int height,
    std::vector<unsigned char>& gray
) {
    gray.resize(static_cast<size_t>(width * height));
    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            size_t i = static_cast<size_t>(y * width + x);
            size_t j = i * 3;
            unsigned int r = rgb[j];
            unsigned int g = rgb[j + 1];
            unsigned int b = rgb[j + 2];
            gray[i] = static_cast<unsigned char>((299 * r + 587 * g + 114 * b) / 1000);
        }
    }
}

/**
 * Run Tesseract OCR on raw image data.
 * This is the heavy function: in-process Tesseract C++ API (no subprocess).
 *
 * @param data     Raw image bytes (grayscale 1 byte/pixel, or RGB 3 bytes/pixel if channels==3)
 * @param width    Image width in pixels
 * @param height   Image height in pixels
 * @param channels 1 for grayscale, 3 for RGB (will be converted to grayscale)
 * @param lang     Tesseract language code, e.g. "eng", "tam", "eng+tam"
 * @return         Extracted UTF-8 text
 */
std::string ocr_image_impl(
    const unsigned char* data,
    int width,
    int height,
    int channels,
    const std::string& lang
) {
    const unsigned char* image_data = data;
    int bytes_per_pixel = 1;
    std::vector<unsigned char> gray_buffer;

    if (channels == 3) {
        rgb_to_grayscale(data, width, height, gray_buffer);
        image_data = gray_buffer.data();
    } else if (channels != 1) {
        return "";  // unsupported
    }

    int bytes_per_line = width * bytes_per_pixel;

    tesseract::TessBaseAPI api;
    if (api.Init(nullptr, lang.c_str(), tesseract::OEM_DEFAULT) != 0) {
        return "";
    }

    api.SetImage(image_data, width, height, bytes_per_pixel, bytes_per_line);
    std::unique_ptr<char[]> out(api.GetUTF8Text());
    api.End();

    if (out) {
        return std::string(out.get());
    }
    return "";
}

/**
 * Pybind11 wrapper: accept Python bytes and dimensions.
 */
std::string ocr_image(
    py::bytes image_bytes,
    int width,
    int height,
    int channels,
    const std::string& lang
) {
    char* ptr = nullptr;
    Py_ssize_t length = 0;
    if (PyBytes_AsStringAndSize(image_bytes.ptr(), &ptr, &length) != 0) {
        throw py::value_error("ocr_image: expected bytes object");
    }
    size_t expected = static_cast<size_t>(width * height * channels);
    if (static_cast<size_t>(length) < expected) {
        throw py::value_error("ocr_image: buffer too small for given dimensions");
    }
    return ocr_image_impl(
        reinterpret_cast<const unsigned char*>(ptr),
        width, height, channels, lang
    );
}

PYBIND11_MODULE(ocr_native, m) {
    m.doc() = "Native OCR module using Tesseract C++ API (pybind11)";
    m.def("ocr_image", &ocr_image,
          py::arg("image_bytes"),
          py::arg("width"),
          py::arg("height"),
          py::arg("channels") = 1,
          py::arg("lang") = "eng+tam",
          "Run OCR on raw image bytes. channels: 1=grayscale, 3=RGB.");
}
