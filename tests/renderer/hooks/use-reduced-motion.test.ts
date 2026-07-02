/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useReducedMotion } from '../../../src/renderer/hooks/use-reduced-motion';

interface MockMediaQueryList {
	matches: boolean;
	media: string;
	addEventListener: ReturnType<typeof vi.fn>;
	removeEventListener: ReturnType<typeof vi.fn>;
	addListener: ReturnType<typeof vi.fn>;
	removeListener: ReturnType<typeof vi.fn>;
	dispatchEvent: ReturnType<typeof vi.fn>;
	onchange: null;
	__trigger: (matches: boolean) => void;
}

function installMatchMedia(initialMatches: boolean): MockMediaQueryList {
	let handler: ((event: MediaQueryListEvent) => void) | null = null;
	const mql: MockMediaQueryList = {
		matches: initialMatches,
		media: '(prefers-reduced-motion: reduce)',
		addEventListener: vi.fn((_type: string, cb: (event: MediaQueryListEvent) => void): void => {
			handler = cb;
		}),
		removeEventListener: vi.fn((): void => {
			handler = null;
		}),
		addListener: vi.fn(),
		removeListener: vi.fn(),
		dispatchEvent: vi.fn(),
		onchange: null,
		__trigger(matches: boolean): void {
			mql.matches = matches;
			if (handler) {
				handler({ matches, media: mql.media } as MediaQueryListEvent);
			}
		},
	};
	window.matchMedia = vi.fn((): MediaQueryList => mql as unknown as MediaQueryList);
	return mql;
}

let container: HTMLDivElement;
let root: Root;

function Probe(): ReturnType<typeof createElement> {
	const reduced: boolean = useReducedMotion();
	return createElement('span', { 'data-testid': 'reduced' }, reduced ? 'reduce' : 'no-preference');
}

function currentText(): string {
	return container.querySelector('[data-testid="reduced"]')?.textContent ?? '';
}

beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => {
		root.unmount();
	});
	container.remove();
	vi.restoreAllMocks();
});

describe('useReducedMotion', () => {
	test('returns true when the OS requests reduced motion', () => {
		installMatchMedia(true);
		act(() => {
			root.render(createElement(Probe));
		});
		expect(currentText()).toBe('reduce');
	});

	test('returns false when the OS does not request reduced motion', () => {
		installMatchMedia(false);
		act(() => {
			root.render(createElement(Probe));
		});
		expect(currentText()).toBe('no-preference');
	});

	test('registers a change listener and updates when the media query changes', () => {
		const mql = installMatchMedia(false);
		act(() => {
			root.render(createElement(Probe));
		});
		expect(currentText()).toBe('no-preference');
		expect(mql.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

		act(() => {
			mql.__trigger(true);
		});
		expect(currentText()).toBe('reduce');
	});

	test('removes the change listener on unmount', () => {
		const mql = installMatchMedia(false);
		act(() => {
			root.render(createElement(Probe));
		});
		act(() => {
			root.unmount();
		});
		expect(mql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
		// Prevent the afterEach hook from unmounting an already-unmounted root.
		root = createRoot(container);
	});
});
