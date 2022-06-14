# MlesTalk UI

![](mlestalk_login.gif)

MlesTalk UI is Node.js/JavaScript based open source reference client user interface for Mles (Modern Lightweight channEl Service). It is used in [MlesTalk](https://play.google.com/store/apps/details?id=io.mles.mlestalk) Android application.

Supports Cordova Android notifications while staying background without additional dependencies to external servers (like e.g. Google Firebase) which may monitor traffic.

Uses [MlesTalk WebWorker](https://github.com/jq-rs/mlestalk-webworker) to handle all data traffic sent over TLS.

Please see more details at https://mles.io/app.html and check Reddit [/r/mles](https://www.reddit.com/r/mles/) channel for everything new, like future planned features.

## It is open source, can I build it myself?

Sure, quite easily with the roughly the following steps (at least you get the idea anyway):
 1. Install [Apache Cordova](https://cordova.apache.org/)
 2. Install Cordova Android platform
 3. Install the needed plugins with ```cordova plugin install <plugin>```
     * cordova-plugin-badge
     * cordova-plugin-androidx-adapter
     * cordova-plugin-console
     * cordova-plugin-device
     * https://github.com/jq-rs/cordova-plugin-background-mode
     * https://github.com/jq-rs/cordova-plugin-local-notifications
 4. Clone this repository and its submodules under your Cordova projects www-directory. Remember to add your own graphics and modifications to the lot. You can even make your own webworker, if you like, just implement the existing API.
 5. Build with ```cordova build android --release -- --packageType=apk```, copy the resulting apk to your device and install it. Well done!
 
