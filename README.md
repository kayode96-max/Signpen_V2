# SignPen - Optimized Edition

The optimized version merging **studio_signout** (full Firebase app) with **Signpen-3D-modelling** (3-D t-shirt).

## What's new vs studio_signout

| Feature | studio_signout | signpen (this) |
|---|---|---|
| Classic 2-D signing board | Yes | Yes |
| 3-D rotatable t-shirt signing | No | Yes - NEW |
| Avatar edit from Customize page | No | Yes - NEW |
| Background image (own card) | Buried in Danger Zone | Fixed |
| AI sentiment summary | Yes | Yes |
| PDF / PNG export | Yes | Yes |
| Firebase Auth + Firestore + Storage | Yes | Yes |

## New files

- src/components/3d/TShirtCanvas.tsx - React Three.js scene wrapper
- src/components/3d/TShirtSigningModal.tsx - Full 3-D signing UI
- public/model/tshirt.gltf - GLTF model (from Signpen-3D-modelling)
- public/model/textures/ - Shirt textures

## Modified files

- src/components/signature/public-sign-out-page.tsx - Added Classic Board / 3-D T-Shirt tabs
- src/app/dashboard/customize/page.tsx - Avatar upload card at the top
- src/app/dashboard/settings/page.tsx - Background image in own card, better avatar preview
- package.json - Added three + @types/three

## Getting started

cd signpen && npm install && npm run dev
