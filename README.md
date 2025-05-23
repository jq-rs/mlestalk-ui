# MlesTalk UI

MlesTalk UI is Node.js/JavaScript based open source reference client user interface for Mles (Modern Lightweight channEl Service). It is used in [MlesTalk](https://mles.io/app.html) Android application.

Supports Cordova Android notifications while staying background without additional dependencies to external servers (like e.g. Google Firebase) which may monitor traffic.

Uses [Zpinc WebWorker](https://github.com/jq-rs/zpinc-webworker) to handle all data traffic sent over TLS.

Please see more details in [implementation analysis article](https://github.com/jq-rs/mlestalk-ui/blob/master/zpinc-implementation-article.md) and check Lemmy [/c/mles](https://lemmy.world/c/mles/) channel for everything new, like future planned features.

## It is open source, can I build it myself?

Sure, quite easily with roughly the following steps (at least you get the idea anyway):
 1. Install [Apache Cordova](https://cordova.apache.org/)
 2. Install Cordova Android platform
 3. Install the needed plugins with ```cordova plugin add <plugin>```
     * cordova-plugin-androidx-adapter
     * cordova-plugin-local-notification
     * cordova-plugin-permission
     * https://github.com/jq-rs/cordova-plugin-background-mode
 4. Clone this repository and its submodules under your Cordova project's www-directory. Remember to add your own graphics and modifications to the lot. You can even make your own webworker, if you like - just implement the API properly.
 5. Build with ```cordova build android --release -- --packageType=apk```, copy the resulting apk to your device and install it. Well done!
 
