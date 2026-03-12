# Tollway Schema Library — Seed Schemas

## TEMPLATE.yaml
```yaml
# Tollway Schema Template
# Copy this file and fill in the selectors for your target site

site: example.com
version: "1"
updated: "YYYY-MM-DD"
maintainer: your-github-username

# Optional: restrict schema to specific URL patterns
path_pattern: "/articles/{id}"

# Define the output fields and their types
output:
  title: string         # text content
  author: string        # text content
  published_at: datetime
  content: string
  tags: array
  # Add more fields as needed

# CSS selectors mapping output fields to DOM elements
selectors:
  title: "h1.article-title"
  author: ".byline .author"
  published_at: "time[datetime]"
  content: ".article-body p"
  tags: ".tag-list a"

# Alternative selectors to try if primary fails
fallback_selectors:
  title:
    - "h1"
    - 'meta[property="og:title"]'
  author:
    - 'meta[name="author"]'

# Post-processing transformations
transformations:
  title:
    strip_prefix: "Article: "  # Remove common prefixes
  content:
    join: " "                   # Join array values

# Test URLs to verify the schema works
test_urls:
  - https://example.com/articles/123
  - https://example.com/articles/456
```

## arxiv.yaml
```yaml
site: arxiv.org
version: "1"
updated: "2026-03-09"
maintainer: tollway-community

output:
  title: string
  authors: array
  abstract: string
  categories: array
  published_at: date
  arxiv_id: string
  pdf_url: string
  doi: string

selectors:
  title: "h1.title"
  authors: ".authors a"
  abstract: "blockquote.abstract"
  categories: ".primary-subject, .secondary-subject"
  published_at: ".submission-history"
  arxiv_id: ".arxivid"

transformations:
  title:
    strip_prefix: "Title:"
  abstract:
    strip_prefix: "Abstract:"
  arxiv_id:
    extract_pattern: 'arXiv:([0-9]+\.[0-9]+)'

derived:
  pdf_url: "https://arxiv.org/pdf/{arxiv_id}"

test_urls:
  - https://arxiv.org/abs/2301.07041
```

## bbc-news.yaml
```yaml
site: bbc.com
version: "1"
updated: "2026-03-09"
maintainer: tollway-community

output:
  title: string
  summary: string
  author: string
  published_at: datetime
  content: string
  section: string
  image_url: string

selectors:
  title: "h1[id='main-heading']"
  summary: "[data-component='text-block'] p:first-child"
  author: "[data-component='byline-block'] .ssrcss-1pjc44v-Contributor"
  published_at: "time[datetime]"
  content: "[data-component='text-block'] p"
  section: ".ssrcss-1r1v3y5-StyledLink"
  image_url: "[data-component='image-block'] img"

test_urls:
  - https://www.bbc.com/news/technology-67890123
```

## github-repo.yaml
```yaml
site: github.com
version: "1"
updated: "2026-03-09"
maintainer: tollway-community
path_pattern: "/{owner}/{repo}"

output:
  name: string
  owner: string
  description: string
  stars: integer
  forks: integer
  language: string
  license: string
  topics: array
  readme: string

selectors:
  name: "[itemprop='name'] strong a"
  description: "[itemprop='about']"
  stars: "#repo-stars-counter-star"
  forks: "#repo-network-counter"
  language: ".repository-content .d-inline [itemprop='programmingLanguage']"
  license: ".BorderGrid-cell a[href*='LICENSE']"
  topics: ".topic-tag"
  readme: "article.markdown-body"

test_urls:
  - https://github.com/anthropics/anthropic-sdk-python
  - https://github.com/langchain-ai/langchain
```

## hackernews.yaml
```yaml
site: news.ycombinator.com
version: "1"
updated: "2026-03-09"
maintainer: tollway-community

output:
  title: string
  url: string
  points: integer
  author: string
  comment_count: integer
  comments: array

selectors:
  # Main listing page
  listing_items: "tr.athing"
  title: "tr.athing .titleline a"
  url: "tr.athing .titleline a"
  points: ".score"
  author: ".hnuser"
  comment_count: 'a[href*="item?id"]'

  # Item/comments page
  story_title: ".storylink, .titleline a"
  story_url: ".titleline a"
  comment_text: ".comment .commtext"
  comment_author: ".comhead .hnuser"

test_urls:
  - https://news.ycombinator.com/
  - https://news.ycombinator.com/item?id=12345678
```

## pubmed.yaml
```yaml
site: pubmed.ncbi.nlm.nih.gov
version: "1"
updated: "2026-03-09"
maintainer: tollway-community

output:
  title: string
  authors: array
  abstract: string
  journal: string
  published_at: date
  pmid: string
  doi: string
  keywords: array

selectors:
  title: "h1.heading-title"
  authors: ".authors-list .authors-list-item .full-name"
  abstract: "#abstract .abstract-content p"
  journal: ".journal-actions .journal-title"
  published_at: ".article-source time"
  pmid: ".article-details .pmid"
  doi: ".article-details .doi"
  keywords: ".keywords-list p"

test_urls:
  - https://pubmed.ncbi.nlm.nih.gov/33517193/
```

## sec-edgar.yaml
```yaml
site: www.sec.gov
version: "1"
updated: "2026-03-09"
maintainer: tollway-community

output:
  company_name: string
  cik: string
  filing_type: string
  filed_date: date
  description: string
  documents: array

selectors:
  # Company search results
  company_name: ".companyName"
  cik: ".CIK"

  # Filing index page
  filing_type: ".formType"
  filed_date: ".dateOfFiling"
  description: ".description"
  document_links: ".tableFile td a"

test_urls:
  - https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=AAPL&type=10-K
```

## stackoverflow.yaml
```yaml
site: stackoverflow.com
version: "1"
updated: "2026-03-09"
maintainer: tollway-community
path_pattern: "/questions/{id}/{slug}"

output:
  title: string
  question_body: string
  asked_by: string
  asked_at: datetime
  votes: integer
  answers: array
  tags: array
  accepted_answer: string

selectors:
  title: "h1.fs-headline1"
  question_body: ".question .s-prose"
  asked_by: ".question .user-details a"
  asked_at: ".question time[datetime]"
  votes: ".question .js-vote-count"
  tags: ".post-taglist a.post-tag"
  accepted_answer: ".answer.accepted-answer .s-prose"
  all_answers: ".answer .s-prose"
  answer_votes: ".answer .js-vote-count"

test_urls:
  - https://stackoverflow.com/questions/11227809/why-is-processing-a-sorted-array-faster
```

## techcrunch.yaml
```yaml
site: techcrunch.com
version: "1"
updated: "2026-03-09"
maintainer: tollway-community

output:
  title: string
  author: string
  published_at: datetime
  content: string
  tags: array
  canonical_url: string

selectors:
  title: "h1.article__title"
  author: ".article__byline .article__byline-text a"
  published_at: "time[datetime]"
  content: ".article-content p"
  tags: ".article__tags a"
  canonical_url: "link[rel='canonical']"

fallback_selectors:
  title:
    - "h1"
    - 'meta[property="og:title"]'
  author:
    - ".byline"
    - 'meta[name="author"]'
  published_at:
    - 'meta[property="article:published_time"]'
  content:
    - "article p"
    - ".post-block p"

test_urls:
  - https://techcrunch.com/2025/01/01/sample-article/
```

## wikipedia.yaml
```yaml
site: en.wikipedia.org
version: "1"
updated: "2026-03-09"
maintainer: tollway-community

output:
  title: string
  summary: string
  sections: array
  infobox: object
  categories: array
  last_edited: string

selectors:
  title: "h1#firstHeading"
  summary: "#mw-content-text .mw-parser-output > p:first-of-type"
  section_headings: ".mw-heading h2, .mw-heading h3"
  section_content: ".mw-content-ltr p"
  infobox: ".infobox tr"
  categories: "#mw-normal-catlinks li a"
  last_edited: "#footer-info-lastmod"

test_urls:
  - https://en.wikipedia.org/wiki/Artificial_intelligence
```

## yahoo-finance.yaml
```yaml
site: finance.yahoo.com
version: "1"
updated: "2026-03-09"
maintainer: tollway-community

output:
  ticker: string
  company_name: string
  price: number
  change: number
  change_percent: number
  market_cap: string
  pe_ratio: string
  summary: string

selectors:
  company_name: "h1.yf-xxbei9"
  price: "[data-field='regularMarketPrice']"
  change: "[data-field='regularMarketChange']"
  change_percent: "[data-field='regularMarketChangePercent']"
  market_cap: '[data-field="marketCap"]'
  pe_ratio: '[data-field="trailingPE"]'
  summary: ".yf-1o4iddl p"

test_urls:
  - https://finance.yahoo.com/quote/AAPL/
  - https://finance.yahoo.com/quote/NVDA/
```

