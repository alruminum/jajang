import React from 'react'
import { render } from '@testing-library/react-native'
import { View, Text } from 'react-native'

describe('minimal', () => {
  it('renders react native', () => {
    const { getByText } = render(<View><Text>Hello</Text></View>)
    expect(getByText('Hello')).toBeTruthy()
  })
})
