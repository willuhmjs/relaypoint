// src/lib/transitions.ts
import type { EasingFunction } from 'svelte/transition';

// Define the shape of our animation objects
export interface AnimationDefinition {
	label: string;
	in: Keyframe[] | PropertyIndexedKeyframes | null;
	out: Keyframe[] | PropertyIndexedKeyframes | null;
}

// Define the transitions using WAAPI-compatible keyframe arrays
// These are converted from your original transitionsCSS
export const transitions = {
	none: {
		label: 'None',
		in: [{ opacity: 1 }],
		out: [{ opacity: 0 }]
	},
	fade: {
		label: 'Fade',
		in: [{ opacity: 0 }, { opacity: 1 }],
		out: [{ opacity: 1 }, { opacity: 0 }]
	},
	blur: {
		label: 'Blur',
		in: [
			{ opacity: 0, filter: 'blur(10px)' },
			{ opacity: 1, filter: 'blur(0px)' }
		],
		out: [
			{ opacity: 1, filter: 'blur(0px)' },
			{ opacity: 0, filter: 'blur(10px)' }
		]
	},
	fly: {
		label: 'Fly Y',
		in: [
			{ opacity: 0, transform: 'translateY(100px)' },
			{ opacity: 1, transform: 'translateY(0)' }
		],
		out: [
			{ opacity: 1, transform: 'translateY(0)' },
			{ opacity: 0, transform: 'translateY(100px)' }
		]
	},
	'slide-x': {
		label: 'Slide X',
		in: [
			{ opacity: 1, transform: 'translateX(-100%)' },
			{ opacity: 1, transform: 'translateX(0)' }
		],
		out: [
			{ opacity: 1, transform: 'translateX(0)' },
			{ opacity: 1, transform: 'translateX(100%)' }
		]
	},
	'slide-y': {
		label: 'Slide Y',
		in: [
			{ opacity: 1, transform: 'translateY(-100%)' },
			{ opacity: 1, transform: 'translateY(0)' }
		],
		out: [
			{ opacity: 1, transform: 'translateY(0)' },
			{ opacity: 1, transform: 'translateY(100%)' }
		]
	},
	scale: {
		label: 'Scale',
		in: [
			{ opacity: 0, transform: 'scale(0.5)' },
			{ opacity: 1, transform: 'scale(1)' }
		],
		out: [
			{ opacity: 1, transform: 'scale(1)' },
			{ opacity: 0, transform: 'scale(0.5)' }
		]
	},
	roll: {
		label: 'Roll X',
		in: [
			{ opacity: 0, transform: 'translateX(-300px) rotate(-360deg)' },
			{ opacity: 1, transform: 'translateX(0) rotate(0deg)' }
		],
		out: [
			{ opacity: 1, transform: 'translateX(0) rotate(0deg)' },
			{ opacity: 0, transform: 'translateX(300px) rotate(360deg)' }
		]
	}
} as const satisfies Record<string, AnimationDefinition>;

export type TransitionType = keyof typeof transitions;

// This part is no longer needed, but we leave the type for reference.
type TransitionParams = {
	delay?: number;
	duration?: number;
	easing?: EasingFunction;
	css?: (t: number, u: number) => string;
	tick?: (t: number, u: number) => void;
};