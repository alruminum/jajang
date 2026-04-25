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
          },
        },
      ],
    ],
  };
};
