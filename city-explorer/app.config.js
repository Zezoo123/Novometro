// app.config.js (at project root)
module.exports = {
    expo: {
      name: "Novometro",
      slug: "city-explorer",
      scheme: "novometro",
      icon: "./assets/images/icon.png",
      splash: {
        image: "./assets/images/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#0f172a"
      },
      userInterfaceStyle: "light",
  
      ios: {
        bundleIdentifier: "com.zezo.cityexplorer",
        // Sign in with Apple needs the capability on the App ID in the developer portal.
        usesAppleSignIn: true,
        infoPlist: {
          NSLocationWhenInUseUsageDescription:
            "Novometro uses your location to check you in at the station you are standing at."
        }
      },
  
      android: {
        package: "com.zezo.cityexplorer",
        permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"]
      },
      
      plugins: [
        "expo-router",
        [
          "expo-image-picker",
          {
            cameraPermission: "Novometro uses the camera so you can snap a photo at the station you check in at.",
            photosPermission: "Novometro can attach a photo from your library to a check-in."
          }
        ],
        "expo-apple-authentication",
        [
          "expo-notifications",
          { color: "#22c55e", defaultChannel: "reminders" }
        ],
        [
          "@rnmapbox/maps",
          // The secret download token is deliberately not configured here: it lives in
          // ~/.gradle/gradle.properties (Android) and ~/.netrc (iOS) so it never enters git.
          { RNMapboxMapsImpl: "mapbox" }
        ],
        [
          "expo-location",
          {
            locationWhenInUsePermission:
              "Novometro uses your location to check you in at the station you are standing at.",
            isAndroidBackgroundLocationEnabled: false
          }
        ]
      ]
    }
  };
  