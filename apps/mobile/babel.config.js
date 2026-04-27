module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          extensions: ['.ts', '.tsx', '.js', '.jsx'],
          alias: {
            '@screens': './src/screens',
            '@components': './src/components',
            '@store': './src/store',
            '@services': './src/services',
            '@audio': './src/audio',
            '@navigation': './src/navigation',
            '@hooks': './src/hooks',
            '@utils': './src/utils',
            '@types': './src/types',
            'react-native-google-mobile-ads': './src/__mocks__/react-native-google-mobile-ads.js',
            'react-native-track-player': './src/__mocks__/react-native-track-player.js',
            'react-native-purchases': './stubs/react-native-purchases.js',
          },
        },
      ],
    ],
  };
};
