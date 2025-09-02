// app.config.js (at project root)
module.exports = {
    expo: {
      name: "city-explorer",
      slug: "city-explorer",
  
      ios: {
        bundleIdentifier: "com.zezo.cityexplorer",
        infoPlist: {
          NSLocationWhenInUseUsageDescription:
            "We use your location to unlock stations near you.",
          NSLocationAlwaysAndWhenInUseUsageDescription:
            "We use your location to unlock stations near you, even in the background."
        }
      },
  
      android: {
        package: "com.zezo.cityexplorer",
        permissions: [
          "ACCESS_COARSE_LOCATION",
          "ACCESS_FINE_LOCATION",
          "ACCESS_BACKGROUND_LOCATION"
        ]
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
          { locationWhenInUsePermission: "We use your location to unlock stations near you." }
        ]
      ]
    }
  };
  