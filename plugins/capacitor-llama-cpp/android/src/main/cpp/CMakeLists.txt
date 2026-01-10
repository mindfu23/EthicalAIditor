cmake_minimum_required(VERSION 3.22.1)
project(llamacpp_jni)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Path to llama.cpp source (will be downloaded/cloned separately)
set(LLAMA_CPP_DIR ${CMAKE_SOURCE_DIR}/llama.cpp)

# Check if llama.cpp exists
if(NOT EXISTS ${LLAMA_CPP_DIR})
    message(WARNING "llama.cpp not found at ${LLAMA_CPP_DIR}. Please clone it:\n  git clone https://github.com/ggerganov/llama.cpp.git ${LLAMA_CPP_DIR}")
endif()

# llama.cpp compile options
set(LLAMA_NATIVE OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(LLAMA_CURL OFF CACHE BOOL "" FORCE)

# Add llama.cpp as subdirectory (if it exists)
if(EXISTS ${LLAMA_CPP_DIR}/CMakeLists.txt)
    add_subdirectory(${LLAMA_CPP_DIR} llama.cpp)
endif()

# JNI wrapper library
add_library(llamacpp_jni SHARED
    llamacpp_jni.cpp
)

# Find JNI
find_package(JNI REQUIRED)

target_include_directories(llamacpp_jni PRIVATE
    ${JNI_INCLUDE_DIRS}
    ${LLAMA_CPP_DIR}/include
    ${LLAMA_CPP_DIR}/ggml/include
)

target_link_libraries(llamacpp_jni
    llama
    ggml
    ${JNI_LIBRARIES}
    android
    log
)

# Optimize for ARM
if(${ANDROID_ABI} STREQUAL "arm64-v8a")
    target_compile_options(llamacpp_jni PRIVATE -march=armv8-a+simd)
elseif(${ANDROID_ABI} STREQUAL "armeabi-v7a")
    target_compile_options(llamacpp_jni PRIVATE -mfpu=neon -mfloat-abi=softfp)
endif()
