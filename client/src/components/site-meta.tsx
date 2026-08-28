import { Helmet } from "react-helmet";
import { useSiteConfig } from "../hooks/useSiteConfig";
import { stripImageUrlMetadata } from "../utils/image-upload";

interface SiteMetaProps {
    title?: string;
    description?: string;
    image?: string;
    children: React.ReactNode;
    noIndex?: boolean;
    canonical?: string;
}

// Component to provide site metadata for pages
export function SiteMeta({ title, description, image, children, noIndex = false, canonical }: SiteMetaProps) {
    const siteConfig = useSiteConfig();

    const pageTitle = title 
        ? `${title} - ${siteConfig.name}` 
        : siteConfig.name;

    const pageDescription = description || siteConfig.description;
    const pageImage = stripImageUrlMetadata(image || siteConfig.avatar);

    return (
        <>
            <Helmet>
                <title>{pageTitle}</title>
                <meta name="description" content={pageDescription} />
                <meta name="robots" content={noIndex ? "noindex,follow" : "index,follow"} />
                <link rel="canonical" href={canonical || (typeof document !== "undefined" ? document.URL : undefined)} />
                <meta property="og:title" content={pageTitle} />
                <meta property="og:description" content={pageDescription} />
                <meta property="og:url" content={typeof document !== "undefined" ? document.URL : undefined} />
                <meta property="og:type" content="article" />
                {pageImage && <meta property="og:image" content={pageImage} />}
                <meta name="twitter:card" content="summary_large_image" />
                <link rel="alternate" type="application/feed+json" href="/rss.json" title={siteConfig.name} />
            </Helmet>
            {children}
        </>
    );
}
