import { render } from '@testing-library/react-native';

it('minimal render test', () => {
  expect(typeof render).toBe('function');
});
