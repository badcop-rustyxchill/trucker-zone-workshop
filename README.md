# Trucker Zone Workshop

Double-click **Zone Workshop.exe** in this folder. It opens the editor in your default browser, served locally at http://127.0.0.1:17876/. Keep this folder's files together. No installation, online account, or internet connection is required. Windows .NET Framework 4.x and a modern WebGL-capable browser are required; the launcher was built and tested on this Windows machine.

The launcher runs in the notification area. Right-click its icon to reopen the editor or exit. Starting the executable again opens the existing editor. To use another static web server instead, serve this folder and open its address. Opening index.html directly cannot load the model files because of browser file-access restrictions.

## Editing

1. Import your latest **TruckerEvent.json**, or begin with the bundled local configuration snapshot.
2. Search/select a monument in the left panel. 48 land-based monument prefabs are available. Underwater labs, caves, oil rigs, ice lakes and quarries are excluded from the picker. Existing imported settings for excluded locations are preserved on export.
3. Choose **Spawn points** or **Deliveries**, then add/select a point.
4. Use **Place** and click a monument/terrain surface, drag the transform arrows, or type local position values. Spawn rotations can be set numerically or with the rotation gizmo. Delivery zones appear as spheres with an editable radius.
5. For a spawn, select **Semi**, **Euro**, or **Compare both**. Every spawn stays visible; the model selector applies to all spawn previews. Both previews use the same configured root position and rotation; the editor preserves their different native pivots. Bounds and configured custom colliders can be displayed.
6. **Export config** downloads a complete plugin-compatible TruckerEvent.json. Other settings in the imported configuration are retained. The tool does not write to the running server.

Monument settings also support enabled state, display name, allowed delivery-type keys, and viewing/exporting one monument's JSON fragment. Single-monument exports are snippets for merging into the Monuments section; the main Import button accepts complete plugin configurations.

Changes autosave in the current browser. Use JSON exports for durable backups and moving between browsers. Undo/redo cover edits and imports. The bundled snapshot should not be assumed to be your latest production configuration.

Fly camera: left-drag empty space or hold the right mouse button to look; WASD to fly, Q/E or Space down/up, Shift for faster movement. Wheel while looking adjusts speed. Orbit and Top modes are also available. Shortcuts: 1 move gizmo, 2 rotate gizmo, P place, F focus selection, Home fit monument, Delete remove, Ctrl+D duplicate, Ctrl+Z/Ctrl+Y undo/redo, Ctrl+S export, / search.

## Geometry and accuracy

- All 48 available monuments use the higher-detail local prefab models. No monument objects or vegetation are hidden. Foliage/fence cutout transparency and glass transparency are restored where indicated by the material names and source texture alpha.
- Monument geometry is batched and shaded grey to reduce draw calls; source geometry and cutout masks are retained. Terrain uses the native eight-channel monument splat masks with shaded ground colours and repeating surface detail. Material colours are simplified; surrounding server-map biome blending is not included.
- The higher-detail monument model library is approximately 469 MB before compression. Geometry is loaded one monument at a time.
- 43 available monuments include their own extracted heightmap templates, with terrain holes and placement influence where available. Locations without a standalone terrain template are explicitly labelled model-only. The editor does not invent terrain for these locations.
- Templates describe monument-local terrain, not the surrounding terrain of a particular server map. Heightmaps are sampled to a 129×129 preview grid. Server-map terrain changes, player construction, live vehicles, and other runtime entities are not represented.
- The two trailers use lightweight custom models built from measured body dimensions, the supplied configs and in-game reference images. Both keep their original Unity root, wheel layout and configured bounds. The green container has two axles; Euro has three, solid tyres, hubs and transparent Eurotransit lettering. Rugs and garage-door hardware are not modelled. Appearance is an approximation and suspension is static; verify final placement in game.
- Config envelopes and collision boxes are optional references for the selected spawn and default off. The generic scenery overlap warning has been removed. Barrel/crate markers use separate data; any proximity message identifies the specific spawn and loot reference. Marker checks use conservative trailer envelopes, not a physics simulation.
- Editor coordinates use Unity local metres and Unity rotation conventions. The rendering conversion reflects Z internally; exported coordinates remain in the plugin's original convention.

## Validation

The native launcher compiled successfully and served the editor on loopback. Browser checks covered monument loading, both trailer previews, numeric placement, delivery radius changes, duplication/undo, configuration import, and an actual configuration export. Automated checks cover all asset references, heightmap data, config preservation/validation, coordinate and rotation conversion, and trailer metadata. The running Rust server and original input files were not modified.

Three.js is bundled locally under vendor/three; its license is included there. Rust monument/prefab assets belong to Facepunch Studios. This package is intended as a local editing tool for the supplied assets.

## Barrel and crate spawns

Loot locations are bundled locally from the dedicated-server monument prefab SpawnGroups and BaseSpawnPoints. No server plugin, connection or import is required. Blue areas show all possible points, including alternate loot choices and radial spawn areas; an individual point can be empty while awaiting loot or because another position was chosen. The overlay uses prefab bounds plus a 0.2 m footprint margin and does not predict the currently active loot population. Server plugins and custom maps that move or add loot locations are outside the standard monument data.

Drop-to-ground spawn heights are aligned to the bundled monument preview surfaces and heightmap where available. These heights describe the local template; a particular server map can change the surrounding terrain. Original source spawn transforms are retained in the bundled data.

Click empty space to deselect. Hold right mouse to rotate in Fly or Orbit mode. Ctrl enables 0.01 m translation snapping and 1 degree rotation snapping; Q/E handle vertical camera movement. Optional Prefab bounds display the source build bounds, not a collision verdict.
