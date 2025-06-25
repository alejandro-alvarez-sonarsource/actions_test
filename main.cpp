#include <chrono>
#include <iostream>
#include <thread>

int main() {
  std::cout << "OHNO" << std::endl;
  std::this_thread::sleep_for(std::chrono::seconds(5));
  return 0;
}
