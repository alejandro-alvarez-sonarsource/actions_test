#include <chrono>
#include <iostream>
#include <thread>

int main() {
  std::cout << "OHNO" << std::endl;
  std::this_thread::sleep_for(std::chrono::seconds(1));
  return 0;
}
