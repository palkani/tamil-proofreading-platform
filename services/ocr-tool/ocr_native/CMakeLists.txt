cmake_minimum_required(VERSION 3.14)
project(ocr_native LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 14)

# Tesseract (pkg-config; no official CMake config)
find_package(PkgConfig REQUIRED)
pkg_check_modules(TESSERACT REQUIRED tesseract)

# pybind11
find_package(pybind11 CONFIG REQUIRED)

# Python extension module
pybind11_add_module(ocr_native ocr_module.cpp)

target_include_directories(ocr_native PRIVATE ${TESSERACT_INCLUDE_DIRS})
target_link_libraries(ocr_native PRIVATE ${TESSERACT_LIBRARIES})
target_link_directories(ocr_native PRIVATE ${TESSERACT_LIBRARY_DIRS})

# Build .so in parent dir so "import ocr_native" works from ocr-tool/
set_target_properties(ocr_native PROPERTIES
  LIBRARY_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/.."
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/.."
)
