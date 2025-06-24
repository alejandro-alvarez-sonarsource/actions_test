# C++ GitHub Actions Test

A simple C++ project demonstrating GitHub Actions integration for build and test automation.

## Project Description

This project contains a simple C++ program that prints "hello" and exits with status code 0.

## GitHub Actions Workflow

The included GitHub Actions workflow performs the following:

1. Builds the project using CMake
2. Executes the resulting binary
3. Verifies that the binary exits with status code 0

If the application exits with any other status code, the workflow will fail.

## Building Locally

To build the project locally:

```bash
mkdir build
cd build
cmake ..
cmake --build .
```

Then run the application:

```bash
./hello_app
```
