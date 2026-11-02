# Brain point cloud

`public/brain-points.bin` is the data behind the 3D hero brain
(`src/components/brain3d.ts`).

## Source and licence

**3D Reference Organ for Brain, Female, v1.4** — HuBMAP Human Reference Atlas,
by Kristen Browne and Heidi Schlehlein, created from the Allen human brain
reference atlas. DOI https://doi.org/10.48539/HBM674.NTLM.353.
Licensed **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/).

We used the GLB as prepared in github.com/Niyaz-05/brain-anatomy-lab
(`public/models/brain.glb`, sha256
`fa4443f16203d4c71fcacbcffa1fff95f1a45eafff8621897a50c3aa34637a5f`), which
merges and simplifies the original meshes (see that repo's ATTRIBUTION.md).
Neither HuBMAP nor the Allen Institute has reviewed or endorsed this site.

## Changes we made (as CC BY 4.0 requires)

`extract.mjs`:

- kept only the outer lateral cortex, cerebellum and brainstem surfaces;
- computed smoothed per-vertex surface curvature (excluding parcel boundaries);
- sampled ~70,000 points, weighted towards gyral crowns, dropping inward-facing
  faces and parcel side walls;
- stored each point's position, normal, curvature and region in a compact
  binary file.

## Rebuild

```bash
# with brain.glb at repo/public/models/brain.glb relative to the script
node extract.mjs 70000   # writes brain-points.bin → copy to public/
```

Format: `uint32 count`, then `int16[count*3]` positions (normalised),
`int8[count*3]` normals, `uint8[count*3]` (ambient occlusion, region, ridge).
