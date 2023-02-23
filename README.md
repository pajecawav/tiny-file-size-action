# tiny-file-size-action

A GitHub Action for running [tiny-file-size](https://github.com/pajecawav/tiny-file-size) on Pull Requests.

<p align="center">
    <img src="https://user-images.githubusercontent.com/18193831/220855989-28578fe4-97cb-4070-a179-30fa7d445684.png" alt="Screenshot" width="738">
</p>

## Setup

Add the following action inside `.github/workflows/size.yml`:

```yaml
name: size

on:
    pull_request:
        branches: [master]

jobs:
    size:
        runs-on: ubuntu-latest

        permissions:
            pull-requests: write
            # Uncomment for private repos
            # contents: read

        steps:
            - uses: actions/checkout@v3

            # Uncomment if using pnpm
            # - uses: pnpm/action-setup@v2
            #   with:
            #       version: 7

            - uses: pajecawav/tiny-file-size-action@v1
              with:
                  github_token: ${{ secrets.GITHUB_TOKEN }}

                  # Edit globs (space-separated list)
                  globs: "dist/* build/*"

                  # Optionally report Brotli size
                  # brotli: true
```
