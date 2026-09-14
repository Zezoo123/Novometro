// app.config.js (at project root)
module.exports = {
    expo: {
      name: "city-explorer",
      slug: "city-explorer",
  
      ios: {
        bundleIdentifier: "com.zezo.cityexplorer",
        infoPlist: {
          NSLocationWhenInUseUsageDescription:
            "Novometro uses your location to check you in at the station you are standing at."
        }
      },
  
      android: {
        package: "com.zezo.cityexplorer",
        permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"]
      },
      
      extra:{
        mapboxDownloadsToken: process.env.MAPBOX_DOWNLOADS_TOKEN,
      },

      plugins: [
        [
          "@rnmapbox/maps",
          {
            RNMapboxMapsDownloadToken: process.env.MAPBOX_DOWNLOADS_TOKEN,
            RNMapboxMapsImpl: "mapbox"
          }
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
  