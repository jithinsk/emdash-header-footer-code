import type * as React from "react";

/**
 * Small inline icons (Phosphor-style, 256 viewBox) so the admin page needs no icon dependency:
 * the host site's Vite compiles this source and may not be able to resolve @phosphor-icons/react.
 */
function Svg({ children, size = 16, ...rest }: React.SVGProps<SVGSVGElement> & { size?: number }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 256 256"
			width={size}
			height={size}
			fill="none"
			stroke="currentColor"
			strokeWidth={16}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
			{...rest}
		>
			{children}
		</svg>
	);
}

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

export const PlusIcon = (p: IconProps) => (
	<Svg {...p}>
		<path d="M40 128h176M128 40v176" />
	</Svg>
);
export const ArrowLeftIcon = (p: IconProps) => (
	<Svg {...p}>
		<path d="M216 128H40M112 56l-72 72 72 72" />
	</Svg>
);
export const DotsIcon = (p: IconProps) => (
	<Svg {...p} fill="currentColor" stroke="none">
		<circle cx="60" cy="128" r="16" />
		<circle cx="128" cy="128" r="16" />
		<circle cx="196" cy="128" r="16" />
	</Svg>
);
export const PencilIcon = (p: IconProps) => (
	<Svg {...p}>
		<path d="M92.7 216H48a8 8 0 0 1-8-8v-44.7a8 8 0 0 1 2.3-5.6l120-120a8 8 0 0 1 11.4 0l44.6 44.6a8 8 0 0 1 0 11.4l-120 120a8 8 0 0 1-5.6 2.3ZM136 64l56 56" />
	</Svg>
);
export const CopyIcon = (p: IconProps) => (
	<Svg {...p}>
		<path d="M168 168h48V40H88v48" />
		<rect x="40" y="88" width="128" height="128" rx="8" />
	</Svg>
);
export const TrashIcon = (p: IconProps) => (
	<Svg {...p}>
		<path d="M216 56H40M104 104v64M152 104v64M200 56v152a8 8 0 0 1-8 8H64a8 8 0 0 1-8-8V56M168 56V40a16 16 0 0 0-16-16h-48a16 16 0 0 0-16 16v16" />
	</Svg>
);
export const InfoIcon = (p: IconProps) => (
	<Svg {...p}>
		<circle cx="128" cy="128" r="96" />
		<path d="M120 120h8v56h8" />
		<circle cx="126" cy="84" r="6" fill="currentColor" stroke="none" />
	</Svg>
);
export const WarningIcon = (p: IconProps) => (
	<Svg {...p}>
		<path d="M128 104v40M114.2 40l-88 152A16 16 0 0 0 40 216h176a16 16 0 0 0 13.8-24l-88-152a16 16 0 0 0-27.6 0Z" />
		<circle cx="128" cy="180" r="6" fill="currentColor" stroke="none" />
	</Svg>
);
export const SearchIcon = (p: IconProps) => (
	<Svg {...p}>
		<circle cx="112" cy="112" r="72" />
		<path d="M163 163l53 53" />
	</Svg>
);
export const XIcon = (p: IconProps) => (
	<Svg {...p}>
		<path d="M200 56 56 200M200 200 56 56" />
	</Svg>
);
export const CodeIcon = (p: IconProps) => (
	<Svg {...p}>
		<path d="m64 88-48 40 48 40M192 88l48 40-48 40M160 40 96 216" />
	</Svg>
);
