// Runs before every unit test file.
import '@testing-library/jest-dom/vitest'; // adds matchers like toBeChecked() and toBeInTheDocument()
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Unmount anything rendered by the previous test
afterEach(() => cleanup());
