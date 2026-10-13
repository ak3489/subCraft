export default function Logo({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 64 64"
            className={className}
            role="img"
            aria-label="字幕工坊 SubCraft"
            style={{ width: "100%", height: "100%" }}
        >
            <rect x="3.5" y="3.5" width="57" height="57" rx="15" fill="#0B0D11" stroke="#F5A524" strokeWidth="3" />
            <g fill="#F5A524">
                <rect x="17" y="26" width="4.5" height="12" rx="2.25" />
                <rect x="24.5" y="21" width="4.5" height="22" rx="2.25" />
                <rect x="32" y="15" width="4.5" height="34" rx="2.25" />
                <rect x="39.5" y="19.5" width="4.5" height="25" rx="2.25" />
                <rect x="47" y="25" width="4.5" height="14" rx="2.25" />
            </g>
            <circle cx="48.5" cy="15.5" r="2.6" fill="#FF5A5F" />
        </svg>
    );
}
