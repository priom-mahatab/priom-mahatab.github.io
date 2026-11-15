# Portfolio — "Trajectory"

A robotics/ML portfolio presented as a flight along a planned robot trajectory.

- **Landing:** your portrait as a LiDAR-style point cloud. It lines up only from the start position and breaks apart as you move.
- **Scroll / swipe / arrow keys:** the camera follows the path through a waypoint per section (Experience → Projects → Achievements → About me). It settles on and turns toward each card.
- **Click a card** to open its details panel. **Index** jumps anywhere. **Contact** flies to the end screen.

## Run locally

No build step. Any static server works:

```sh
python3 -m http.server 5173
# open http://localhost:5173
```

Add `?s=600` to the URL to start partway along the path (useful while editing).

## Edit content

Everything is in [`js/content.js`](js/content.js): profile, about text, links, and each section's items.

- Portrait: `assets/me.png`. A head-and-shoulders photo with the background removed gives the cleanest point cloud.
- Card images: put them in `assets/projects/` or `assets/about/` and set `image: "assets/projects/x.jpg"`. Landscape images work best.
- `gallery: [...]` adds extra images to a card's details panel.

## Deploy

It's a static site. Push the folder to GitHub Pages, Netlify or Vercel as-is.
