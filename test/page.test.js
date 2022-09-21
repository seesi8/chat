import React from 'react';
import { render, screen } from '@testing-library/react';
import Thing from '../pages/testthing.jsx';

describe('testing Home page', () => {
    test('render h1 element', () => {
        render(<Thing />);
        expect(screen.getByText('Hello World')).toBeInTheDocument();
    });
});