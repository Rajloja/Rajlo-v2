#requires -Version 5.1
<#
.SYNOPSIS
    Populates public/landing/ with Jamaica + Caribbean-themed
    photography for the landing page. Re-run any time to refresh.

.DESCRIPTION
    The landing page references local files at /landing/<name>.jpg.
    Those files don't ship in the repo because final brand
    photography will eventually be commissioned. Until then this
    script pulls hand-picked Unsplash photos that fit a Jamaican
    rideshare context (Kingston aerials, route-taxi street scenes,
    drivers at the wheel, Black/Caribbean portraits for testimonial
    avatars, etc).

    Once you have Rajlo-owned photography:
      - drop replacement files at the same paths with the same
        filenames and they will be picked up automatically; OR
      - rename PHOTOS in src/components/landing-v2.tsx to point at
        your new files.

    To swap a single photo, change its `slug` below and either
    delete the existing file or pass -Force to overwrite.

.NOTES
    Uses Unsplash's slug-based download URL
    (https://unsplash.com/photos/{slug}/download?w={width}) which
    redirects to the canonical JPEG. All photos selected here are
    licensed under the Unsplash License (free for commercial use,
    no attribution required).
#>

param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$target = Join-Path $root "public/landing"
if (-not (Test-Path $target)) {
    New-Item -ItemType Directory -Path $target | Out-Null
}

# filename -> Unsplash slug + width. Notes on the picks:
#   hero-1..4:   four landscape photos used in the hero carousel.
#                Kingston aerial, downtown skyline, a real Jamaican
#                taxi on the road, and a tropical-coast shot so the
#                "island-wide" claim has visual weight.
#   mode-*:      one photo per mode card. Private = hand on wheel,
#                route-taxi = parked street cars, drive = BMW wheel.
#   pillar-*:    one photo per WhyRajlo pillar.
#   driver-hero: full-bleed portrait used behind the driver
#                recruitment section.
#   avatar-*:    square Caribbean/Black portraits for testimonials.
$photos = @(
    @{ name = "hero-1.jpg";              slug = "_52iqVQKEsU"; w = 2000 }  # aerial Kingston cityscape
    @{ name = "hero-2.jpg";              slug = "xoGK4R6bp4I"; w = 2000 }  # downtown skyline
    @{ name = "hero-3.jpg";              slug = "tr7tUNGZSoo"; w = 2000 }  # white Nissan taxi
    @{ name = "hero-4.jpg";              slug = "0VR6WZEeUZU"; w = 2000 }  # tropical Jamaica beach
    @{ name = "mode-private.jpg";        slug = "oh9FVFAWyvk"; w = 1600 }  # driving, hand on wheel
    @{ name = "mode-route-taxi.jpg";     slug = "otyZESODCfI"; w = 1600 }  # parked cars on roadside
    @{ name = "mode-drive.jpg";          slug = "mKrPowm00s8"; w = 1600 }  # driver holding wheel
    @{ name = "pillar-safety.jpg";       slug = "y-CxNuWSk08"; w = 1400 }  # taxi driver hands clasped
    @{ name = "pillar-cashless.jpg";     slug = "j47SGL3vq4k"; w = 1400 }  # interior driving
    @{ name = "pillar-local.jpg";        slug = "gksePWvWcWc"; w = 1400 }  # man on bike, palm tree
    @{ name = "pillar-fair.jpg";         slug = "uxh_FRlmORg"; w = 1400 }  # green coast/water
    @{ name = "driver-hero.jpg";         slug = "2EGNqazbAMk"; w = 2200 }  # smiling man (recruitment hero)
)

foreach ($p in $photos) {
    $out = Join-Path $target $p.name
    if ((Test-Path $out) -and -not $Force -and ((Get-Item $out).Length -gt 1024)) {
        continue
    }
    $url = "https://unsplash.com/photos/$($p.slug)/download?w=$($p.w)"
    try {
        Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing -TimeoutSec 60
        Write-Host ("OK  {0,-32}  {1,7} B  ({2})" -f $p.name, (Get-Item $out).Length, $p.slug)
    } catch {
        Write-Warning "Failed: $($p.name) - $($_.Exception.Message)"
    }
}
