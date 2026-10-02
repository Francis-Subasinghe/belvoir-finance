# Open decisions

The owner (Francis) approves every item unless noted. Each one has a working assumption so the build doesn't block.

| # | Decision | Working assumption | Options and cost | Approver |
| --- | --- | --- | --- | --- |
| D1 | Domain and registrar | No domain is used. The preview runs on GitHub Pages | Connect the domain later. DNS changes need authorisation | Francis |
| D2 | Audience and jurisdiction | UK SME founders and operators, UK only | Widening needs labelled content per jurisdiction | Francis |
| D3 | Editorial section name | "Belvoir Finance" | A distinct brand would need a design pass | Francis |
| D4 | "Work with Belvoir" link | Not in the MVP | Footer link only, once services are verified | Francis |
| D5 | Hosting and PR previews | GitHub Pages (free) for the preview only, with headers as an accepted limitation. A header-capable host is required before launch | Cloudflare Pages or Netlify free tiers give per-PR previews but need an account | Francis |
| D6 | Newsletter provider and analytics | A UI stub behind an interface. No analytics, so PRD measures stay unmeasured until this is decided. The bot-check secret needs the provider's hosted form or a serverless function | Buttondown, MailerLite or similar. Plausible-style analytics without cookies | Francis |
| D7 | Usable feeds and APIs | Titles and links only until the terms are checked | Verified one by one in the registry | Atlas checks, Francis approves |
| D8 | Named authors, reviewers and approver | Placeholder people marked as demo | Real names only with consent | Francis |
| D9 | Launch articles and the ~50 sources | 3 demo stories and ~10 sourced registry entries | Grows after launch | Francis |
| D10 | Whether tools are illustrative or professionally reviewed | Illustrative only, with no current tax values | Use real rates only with reviewer sign-off | Francis |
| D11 | Licence for code and content | None yet (all rights reserved by default) | Code under MIT, content under CC BY-NC or proprietary | Francis |
| D12 | Wireframes | Low-fidelity wireframes made by Forge in F2 as page-shell screenshots, reviewed by Atlas | Figma would need an account | Atlas |
| D13 | Site search | Pagefind (static, free, no server) | Algolia would need an account | Atlas |
