extends Node3D
## The tabletop renders authoritative snapshots; game rules stay on the server.

signal territory_selected(province_id: String)
signal battalion_selected(battalion_id: String)
signal territory_command(province_id: String)
signal move_requested(battalion_id: String, province_id: String)
signal quality_changed(preset: String)

const Factory = preload("res://scripts/Props3DFactory.gd")
const OCEAN_SHADER = preload("res://shaders/ocean.gdshader")
const MAP_SCALE := 0.025
const MAP_ORIGIN := Vector2(720, 340)
const BUILDING_FIELDS := {"FORT": "fortLevel", "BARRACKS": "barracksLevel", "MARKET": "marketLevel", "PORT": "portLevel", "FOUNDRY": "foundryLevel", "TEMPLE": "templeLevel"}
const CONTINENT_COLORS := {"SOUTH_AMERICA": Color("6b9d78"), "NORTH_AMERICA": Color("b0a277"), "EUROPE": Color("9b9890"), "MENA_AFRICA": Color("b2966b"), "ASIA": Color("9b8f6c")}
const SEASON_TINTS := {"SPRING": Color("80c79b"), "SUMMER": Color("ead79c"), "AUTUMN": Color("d49965"), "WINTER": Color("b8cbd4")}

var selected_battalion_id := ""
var selected_province_id := ""
var quality_preset := "high"
var _player_id := ""
var _state: Dictionary = {}
var _schema: Dictionary = {}
var _provinces: Dictionary = {}
var _territories: Dictionary = {}
var _armies: Dictionary = {}
var _structures: Dictionary = {}
var _players: Dictionary = {}
var _tweens: Dictionary = {}
var _heights: Dictionary = {}
var _sea_positions: Dictionary = {}
var _season := ""
var _terrain_root: Node3D
var _prop_root: Node3D
var _structure_root: Node3D
var _camera: Camera3D
var _sun: DirectionalLight3D
var _environment: WorldEnvironment
var _particles: GPUParticles3D
var _ocean_material: ShaderMaterial
var _selection: MeshInstance3D
var _target := Vector3(0, 0, 0)
var _camera_target := Vector3(0, 0, 0)
var _distance := 34.0
var _smooth_distance := 34.0
var _yaw := 0.0
var _pitch := 1.02
var _dragging := false
var _orbiting := false
var _elapsed := 0.0
var _geometry_signature := ""

func _ready() -> void:
	_build_stage()
	var requested_quality := OS.get_environment("CONCORDIA_GODOT_QUALITY")
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--quality="):
			requested_quality = argument.trim_prefix("--quality=")
	if requested_quality.is_empty():
		var settings := ConfigFile.new()
		if settings.load("user://graphics.cfg") == OK:
			requested_quality = str(settings.get_value("graphics", "quality", "high"))
	set_quality(requested_quality if requested_quality in ["low", "balanced", "high"] else "high")
	_load_fallback_map()
	_set_season("SPRING")
	_update_camera(1.0)

func set_schema(bootstrap: Dictionary) -> void:
	_schema = bootstrap.get("schema", bootstrap)
	var map_data: Array = _schema.get("map", [])
	if not map_data.is_empty() and _state.is_empty():
		_build_map(map_data)

func apply_state(game: Dictionary, player_id: String) -> void:
	if not _state.is_empty() and str(game.get("code", "")) != str(_state.get("code", "")):
		_clear_props()
		selected_battalion_id = ""
		selected_province_id = ""
	_state = game
	_player_id = player_id
	_players.clear()
	for player in game.get("players", []):
		_players[str(player.get("id", ""))] = player
	var provinces: Array = game.get("provinces", [])
	if provinces.is_empty():
		return
	var signature_parts := PackedStringArray()
	for province in provinces:
		var rings: Array = province.get("rings", [])
		signature_parts.append(str(province.get("id", "")) + ":" + str(rings.hash()))
	var signature := "|".join(signature_parts)
	if signature != _geometry_signature:
		_build_map(provinces)
		_geometry_signature = signature
	else:
		for province in provinces:
			_provinces[str(province.get("id", ""))] = province
	_set_season(str(game.get("season", "SPRING")))
	_update_territory_colors()
	_update_structures()
	_update_armies(game.get("battalions", []))
	_update_selection()

func select_battalion(battalion_id: String) -> void:
	selected_battalion_id = battalion_id
	if _armies.has(battalion_id):
		selected_province_id = str(_armies[battalion_id].get_meta("province_id", ""))
	_update_selection()

func focus_province(province_id: String) -> void:
	if _provinces.has(province_id):
		_target = _province_position(province_id)
		_target.y = 0

func camera_node() -> Camera3D:
	return _camera

func set_quality(preset: String) -> void:
	if not preset in ["high", "balanced", "low"]:
		return
	quality_preset = preset
	var viewport := get_viewport()
	viewport.msaa_3d = Viewport.MSAA_4X if preset == "high" else Viewport.MSAA_2X if preset == "balanced" else Viewport.MSAA_DISABLED
	viewport.scaling_3d_scale = 0.67 if preset == "low" else 0.85 if preset == "balanced" else 1.0
	_sun.shadow_enabled = preset == "high"
	var current_season := _season if not _season.is_empty() else "SPRING"
	_season = ""
	_set_season(current_season)
	var settings := ConfigFile.new()
	settings.set_value("graphics", "quality", preset)
	settings.save("user://graphics.cfg")
	quality_changed.emit(preset)

func _build_stage() -> void:
	_terrain_root = Node3D.new()
	_terrain_root.name = "Territories"
	add_child(_terrain_root)
	_prop_root = Node3D.new()
	_prop_root.name = "Miniatures"
	add_child(_prop_root)
	_structure_root = Node3D.new()
	_structure_root.name = "CitiesAndCastles"
	add_child(_structure_root)
	var table := MeshInstance3D.new()
	var table_mesh := BoxMesh.new()
	table_mesh.size = Vector3(39, 0.6, 22.5)
	table.mesh = table_mesh
	table.position.y = -0.65
	table.material_override = Factory.material(Color("3e2d24"), 0.0, 0.78)
	table.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(table)
	for side in [-1.0, 1.0]:
		_add_frame(Vector3(39.4, 0.18, 0.2), Vector3(0, -0.22, side * 11.2))
		_add_frame(Vector3(0.2, 0.18, 22.4), Vector3(side * 19.6, -0.22, 0))
	var ocean := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(39, 22)
	plane.subdivide_width = 48
	plane.subdivide_depth = 24
	ocean.mesh = plane
	ocean.position.y = -0.25
	_ocean_material = ShaderMaterial.new()
	_ocean_material.shader = OCEAN_SHADER
	ocean.material_override = _ocean_material
	ocean.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(ocean)
	_environment = WorldEnvironment.new()
	var environment := Environment.new()
	var sky := Sky.new()
	var sky_material := ProceduralSkyMaterial.new()
	sky_material.sky_top_color = Color("13232f")
	sky_material.sky_horizon_color = Color("637c86")
	sky_material.ground_horizon_color = Color("40535a")
	sky_material.ground_bottom_color = Color("111c26")
	sky.sky_material = sky_material
	environment.sky = sky
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("111e28")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("b8cbd4")
	environment.ambient_light_energy = 0.42
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.tonemap_exposure = 0.85
	environment.fog_enabled = true
	environment.fog_density = 0.002
	environment.fog_light_color = Color("4c6872")
	environment.fog_sky_affect = 0.0
	_environment.environment = environment
	add_child(_environment)
	_sun = DirectionalLight3D.new()
	_sun.rotation_degrees = Vector3(-55, -28, 0)
	_sun.light_energy = 1.4
	_sun.shadow_enabled = true
	_sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	_sun.directional_shadow_max_distance = 65.0
	add_child(_sun)
	_camera = Camera3D.new()
	_camera.name = "TacticalCamera"
	_camera.fov = 45.0
	_camera.near = 0.1
	_camera.far = 140.0
	_camera.current = true
	add_child(_camera)
	_selection = MeshInstance3D.new()
	var ring := TorusMesh.new()
	ring.inner_radius = 0.66
	ring.outer_radius = 0.71
	ring.rings = 24
	ring.ring_segments = 6
	_selection.mesh = ring
	_selection.material_override = Factory.material(Color("ffe79f"), 0.6, 0.25)
	_selection.visible = false
	add_child(_selection)
	_particles = GPUParticles3D.new()
	_particles.name = "SeasonWeather"
	_particles.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_particles.position = Vector3(0, 7, 0)
	_particles.amount = 100
	_particles.lifetime = 7.0
	_particles.visibility_aabb = AABB(Vector3(-22, -9, -14), Vector3(44, 18, 28))
	var particle_material := ParticleProcessMaterial.new()
	particle_material.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	particle_material.emission_box_extents = Vector3(18, 0.5, 10)
	particle_material.direction = Vector3(0.15, -1, 0.1)
	particle_material.spread = 12.0
	particle_material.initial_velocity_min = 0.4
	particle_material.initial_velocity_max = 1.2
	particle_material.gravity = Vector3(0.15, -0.45, 0)
	_particles.process_material = particle_material
	var flake := SphereMesh.new()
	flake.radius = 0.035
	flake.height = 0.07
	flake.radial_segments = 4
	flake.rings = 2
	_particles.draw_pass_1 = flake
	add_child(_particles)

func _add_frame(size: Vector3, at: Vector3) -> void:
	var mesh := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = size
	mesh.mesh = box
	mesh.position = at
	mesh.material_override = Factory.material(Color("aa8444"), 0.7, 0.4)
	mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mesh)

func _load_fallback_map() -> void:
	var bootstrap_path := "res://data/bootstrap.json"
	if FileAccess.file_exists(bootstrap_path):
		var bootstrap = JSON.parse_string(FileAccess.get_file_as_string(bootstrap_path))
		if bootstrap is Dictionary:
			set_schema(bootstrap)
			if not _provinces.is_empty():
				return
	var source := "res://data/world-geometry.json"
	if FileAccess.file_exists(source):
		var data = JSON.parse_string(FileAccess.get_file_as_string(source))
		if data is Array:
			_build_map(data)

func _build_map(provinces: Array) -> void:
	_clear_props()
	for child in _terrain_root.get_children():
		_terrain_root.remove_child(child)
		child.queue_free()
	_provinces.clear()
	_territories.clear()
	_heights.clear()
	_sea_positions.clear()
	var outline_root := Node3D.new()
	outline_root.name = "GoldenBorders"
	_terrain_root.add_child(outline_root)
	var land_polygons: Array[PackedVector2Array] = []
	for value in provinces:
		if value is Dictionary:
			_provinces[str(value.get("id", ""))] = value
			if str(value.get("kind", "LAND")) != "SEA_ZONE":
				for ring_data in value.get("rings", []):
					var polygon := _project_ring(ring_data)
					if polygon.size() >= 3:
						land_polygons.append(polygon)
	for value in provinces:
		if value is Dictionary and str(value.get("kind", "LAND")) == "SEA_ZONE":
			_sea_positions[str(value.get("id", ""))] = _water_anchor(value, land_polygons)
	for value in provinces:
		if not value is Dictionary:
			continue
		var province: Dictionary = value
		var id := str(province.get("id", ""))
		_provinces[id] = province
		if str(province.get("kind", "LAND")) == "SEA_ZONE":
			_build_compass(province)
			continue
		var height := 0.85 if str(province.get("terrain", "")) == "mountains" or id in ["andes", "afghan", "china-west", "anatolia"] else 0.35
		_heights[id] = height
		var body := StaticBody3D.new()
		body.name = "Territory_" + id
		body.set_meta("province_id", id)
		var surface := SurfaceTool.new()
		surface.begin(Mesh.PRIMITIVE_TRIANGLES)
		var bevel := SurfaceTool.new()
		bevel.begin(Mesh.PRIMITIVE_TRIANGLES)
		var triangle_count := 0
		for ring_data in province.get("rings", []):
			var polygon := _project_ring(ring_data)
			if polygon.size() < 3:
				continue
			if Geometry2D.is_polygon_clockwise(polygon):
				polygon.reverse()
			var indices := Geometry2D.triangulate_polygon(polygon)
			if indices.is_empty():
				continue
			var center := Vector2.ZERO
			for point in polygon:
				center += point
			center /= polygon.size()
			var inset := PackedVector2Array()
			for point in polygon:
				inset.append(center + (point - center) * 0.996)
			for index in range(0, indices.size(), 3):
				for corner in [0, 1, 2]:
					var point := inset[indices[index + corner]]
					surface.add_vertex(Vector3(point.x, height, point.y))
				triangle_count += 1
			for index in polygon.size():
				var a := polygon[index]
				var b := polygon[(index + 1) % polygon.size()]
				var ai := inset[index]
				var bi := inset[(index + 1) % inset.size()]
				_add_quad(surface, Vector3(a.x, -0.18, a.y), Vector3(b.x, -0.18, b.y), Vector3(b.x, height - 0.045, b.y), Vector3(a.x, height - 0.045, a.y))
				_add_quad(bevel, Vector3(a.x, height - 0.045, a.y), Vector3(b.x, height - 0.045, b.y), Vector3(bi.x, height, bi.y), Vector3(ai.x, height, ai.y))
		if triangle_count == 0:
			continue
		surface.generate_normals()
		var terrain_mesh := MeshInstance3D.new()
		terrain_mesh.mesh = surface.commit()
		body.add_child(terrain_mesh)
		var collision := CollisionShape3D.new()
		collision.shape = terrain_mesh.mesh.create_trimesh_shape()
		body.add_child(collision)
		bevel.generate_normals()
		var border := MeshInstance3D.new()
		border.mesh = bevel.commit()
		border.material_override = Factory.material(Color("8b6d36"), 0.6, 0.48)
		border.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		outline_root.add_child(border)
		_terrain_root.add_child(body)
		_territories[id] = terrain_mesh
		_add_place_label(province, height + 0.15)
	Factory.bake_static_geometry(outline_root, "borders:" + str(provinces.hash()), false)
	_update_territory_colors()

func _project_ring(raw: Array) -> PackedVector2Array:
	var polygon := PackedVector2Array()
	for value in raw:
		if value is Array and value.size() >= 2:
			var point := (Vector2(float(value[0]), float(value[1])) - MAP_ORIGIN) * MAP_SCALE
			if polygon.is_empty() or polygon[polygon.size() - 1].distance_squared_to(point) > 0.0000001:
				polygon.append(point)
	if polygon.size() > 2 and polygon[0].distance_squared_to(polygon[polygon.size() - 1]) < 0.0000001:
		polygon.remove_at(polygon.size() - 1)
	return polygon

func _add_quad(surface: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, d: Vector3) -> void:
	for point in [a, b, c, a, c, d]:
		surface.add_vertex(point)

func _province_position(id: String) -> Vector3:
	if _sea_positions.has(id):
		return _sea_positions[id]
	var province: Dictionary = _provinces.get(id, {})
	var point := (Vector2(float(province.get("x", 720)), float(province.get("y", 340))) - MAP_ORIGIN) * MAP_SCALE
	return Vector3(point.x, float(_heights.get(id, -0.12)), point.y)

func _water_anchor(province: Dictionary, land_polygons: Array[PackedVector2Array]) -> Vector3:
	var center := (Vector2(float(province.get("x", 720)), float(province.get("y", 340))) - MAP_ORIGIN) * MAP_SCALE
	var rings: Array = province.get("rings", [])
	var bounds := _project_ring(rings[0]) if not rings.is_empty() else PackedVector2Array()
	for ring in range(24):
		var options := 1 if ring == 0 else 24
		for index in options:
			var angle := float(index) * TAU / options
			var candidate := center + Vector2(cos(angle), sin(angle)) * float(ring) * 0.18
			if not bounds.is_empty() and not Geometry2D.is_point_in_polygon(candidate, bounds):
				continue
			var clear := true
			for polygon in land_polygons:
				for offset in [Vector2.ZERO, Vector2(0.29, 0), Vector2(-0.29, 0), Vector2(0, 0.29), Vector2(0, -0.29)]:
					if Geometry2D.is_point_in_polygon(candidate + offset, polygon):
						clear = false
						break
				if not clear:
					break
			if clear:
				return Vector3(candidate.x, -0.12, candidate.y)
	return Vector3(center.x, -0.12, center.y)

func _clear_props() -> void:
	for tween in _tweens.values():
		if tween.is_valid():
			tween.kill()
	_tweens.clear()
	for container in [_prop_root, _structure_root]:
		if is_instance_valid(container):
			for child in container.get_children():
				container.remove_child(child)
				child.queue_free()
	_armies.clear()
	_structures.clear()

func _add_place_label(province: Dictionary, height: float) -> void:
	var label := Label3D.new()
	label.name = "Label_" + str(province.get("id", ""))
	label.text = str(province.get("name", ""))
	label.position = _province_position(str(province.get("id", "")))
	label.position.y = height
	label.font_size = 28
	label.pixel_size = 0.005
	label.outline_size = 6
	label.outline_modulate = Color("18262b")
	label.modulate = Color("f9edc8")
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.no_depth_test = false
	label.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	if FileAccess.file_exists("res://data/fonts/Cinzel.ttf"):
		label.font = load("res://data/fonts/Cinzel.ttf")
	_terrain_root.add_child(label)

func _build_compass(province: Dictionary) -> void:
	var id := str(province.get("id", ""))
	var body := StaticBody3D.new()
	body.set_meta("province_id", id)
	body.position = _province_position(id)
	# Compass tokens sit on short bronze buoys: visible above the waterline and
	# nearby coast relief, instead of becoming buried behind a raised continent.
	body.position.y = 0.12
	var pedestal := MeshInstance3D.new()
	var pedestal_mesh := CylinderMesh.new()
	pedestal_mesh.top_radius = 0.10
	pedestal_mesh.bottom_radius = 0.15
	pedestal_mesh.height = 0.36
	pedestal_mesh.radial_segments = 8
	pedestal.mesh = pedestal_mesh
	pedestal.position.y = -0.18
	pedestal.material_override = Factory.material(Color("8e8159"), 0.5, 0.55)
	pedestal.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	body.add_child(pedestal)
	var ring := MeshInstance3D.new()
	var mesh := TorusMesh.new()
	mesh.inner_radius = 0.24
	mesh.outer_radius = 0.26
	mesh.rings = 16
	mesh.ring_segments = 4
	ring.mesh = mesh
	ring.material_override = Factory.material(Color("c8b376"), 0.7, 0.5)
	ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	body.add_child(ring)
	for angle in [0.0, PI / 2.0]:
		var needle := MeshInstance3D.new()
		var shape := PrismMesh.new()
		shape.size = Vector3(0.11, 0.08, 0.7)
		needle.mesh = shape
		needle.rotation.y = angle
		needle.material_override = ring.material_override
		needle.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		body.add_child(needle)
	var collision := CollisionShape3D.new()
	var shape := CylinderShape3D.new()
	shape.radius = 0.45
	shape.height = 0.25
	collision.shape = shape
	body.add_child(collision)
	Factory.bake_static_geometry(body, "sea-compass", false)
	_terrain_root.add_child(body)
	_add_place_label(province, 0.13)

func _nation_color(owner_id: String) -> Color:
	var player: Dictionary = _players.get(owner_id, {})
	return Color.from_string(str(player.get("color", "#999b8b")), Color("999b8b"))

func _update_territory_colors() -> void:
	for id in _territories:
		var province: Dictionary = _provinces.get(id, {})
		var owner_id := str(province.get("occupierId", ""))
		if owner_id.is_empty() or owner_id == "<null>":
			owner_id = str(province.get("ownerId", ""))
		var base: Color = CONTINENT_COLORS.get(str(province.get("continent", "")), Color("999b85"))
		if _players.has(owner_id):
			base = _nation_color(owner_id).lightened(0.24)
		var tint: Color = SEASON_TINTS.get(_season, Color.WHITE)
		var strength := 0.5 if _season == "WINTER" else 0.28
		_territories[id].material_override = Factory.material(base.lerp(tint, strength), 0.04, 0.82)

func _update_structures() -> void:
	var keep: Dictionary = {}
	for id in _provinces:
		var province: Dictionary = _provinces[id]
		if str(province.get("kind", "LAND")) == "SEA_ZONE":
			continue
		var offset := 0
		for building in BUILDING_FIELDS:
			var level := int(province.get(BUILDING_FIELDS[building], 0))
			if level <= 0:
				continue
			var key := str(id) + ":" + str(building)
			keep[key] = true
			var owner_id := str(province.get("ownerId", ""))
			var stamp := str(level) + ":" + owner_id + ":" + _nation_color(owner_id).to_html()
			if _structures.has(key) and str(_structures[key].get_meta("stamp", "")) == stamp:
				offset += 1
				continue
			if _structures.has(key):
				_structures[key].queue_free()
			var prop := Factory.create_structure_prop_3d(str(building), level, _nation_color(owner_id), id)
			prop.scale = Vector3.ONE * 0.55
			prop.position = _province_position(id) + Vector3((offset % 3 - 1) * 0.65, 0.025, 0.5 + floorf(offset / 3.0) * 0.65)
			prop.set_meta("stamp", stamp)
			_structure_root.add_child(prop)
			_structures[key] = prop
			offset += 1
	for key in _structures.keys():
		if not keep.has(key):
			_structures[key].queue_free()
			_structures.erase(key)

func _update_armies(armies: Array) -> void:
	var keep: Dictionary = {}
	var used: Array[Vector3] = []
	var ordered := armies.duplicate()
	ordered.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return str(a.get("id", "")) < str(b.get("id", "")))
	for army in ordered:
		if not army is Dictionary or army.get("embarkedOnId") != null:
			continue
		var id := str(army.get("id", ""))
		var province_id := str(army.get("provinceId", ""))
		if not _provinces.has(province_id):
			continue
		keep[id] = true
		var is_ship := bool(army.get("isFleet", false))
		var variant := "ship" if is_ship else Factory.army_variant(army)
		var owner_id := str(army.get("ownerId", ""))
		var stamp := variant + ":" + owner_id + ":" + _nation_color(owner_id).to_html()
		var fresh := not _armies.has(id)
		if not fresh and str(_armies[id].get_meta("stamp", "")) != stamp:
			_armies[id].queue_free()
			_armies.erase(id)
			fresh = true
		if fresh:
			var prop := Factory.create_ship_prop_3d(army, _nation_color(owner_id)) if is_ship else Factory.create_army_prop_3d(army, _nation_color(owner_id))
			prop.set_meta("stamp", stamp)
			prop.set_meta("owner_id", owner_id)
			prop.set_meta("is_ship", is_ship)
			_prop_root.add_child(prop)
			_armies[id] = prop
		var root: Node3D = _armies[id]
		Factory.update_army_prop(root, army)
		var destination := _find_prop_position(_province_position(province_id), used, is_ship)
		used.append(destination)
		root.set_meta("rest_y", destination.y)
		if fresh:
			root.position = destination
		elif root.position.distance_squared_to(destination) > 0.02:
			if _tweens.has(id) and _tweens[id].is_valid():
				_tweens[id].kill()
			var tween := create_tween()
			tween.tween_property(root, "position", destination, 0.65).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
			_tweens[id] = tween
	for id in _armies.keys():
		if not keep.has(id):
			if _tweens.has(id) and _tweens[id].is_valid():
				_tweens[id].kill()
				_tweens.erase(id)
			_armies[id].queue_free()
			_armies.erase(id)
			if selected_battalion_id == id:
				selected_battalion_id = ""

func _find_prop_position(base: Vector3, used: Array[Vector3], ship: bool) -> Vector3:
	var result := base + Vector3(0, 0.04, -0.22)
	var spacing := 1.25 if ship else 1.1
	for ring in range(8):
		var options := 1 if ring == 0 else ring * 8
		for index in options:
			var angle := float(index) * TAU / options
			var candidate := base + Vector3(cos(angle) * ring * spacing, 0.04, sin(angle) * ring * spacing - 0.22)
			var available := true
			for previous in used:
				if Vector2(candidate.x - previous.x, candidate.z - previous.z).length() < spacing:
					available = false
					break
			if available:
				return candidate
	return result

func _set_season(season_name: String) -> void:
	if _season == season_name:
		return
	_season = season_name
	var tint: Color = SEASON_TINTS.get(_season, Color.WHITE)
	_sun.light_color = tint
	_sun.light_energy = 1.10 if _season == "SUMMER" else 0.55 if _season == "WINTER" else 0.85
	_environment.environment.ambient_light_color = Color("bdcbd3") if _season == "WINTER" else Color("c0c8c5")
	_environment.environment.ambient_light_energy = 0.28 if _season == "WINTER" else 0.35
	_environment.environment.fog_light_color = Color("526b7e") if _season == "WINTER" else Color("354951")
	_environment.environment.fog_density = 0.004 if _season == "WINTER" else 0.0015
	_ocean_material.set_shader_parameter("deep_color", Color("0c4a60") if _season == "SUMMER" else Color("17394b") if _season == "WINTER" else Color("15343a"))
	_ocean_material.set_shader_parameter("crest_color", Color("226e7a") if _season == "SUMMER" else Color("3a6274") if _season == "WINTER" else Color("4c5d4b") if _season == "AUTUMN" else Color("2a5557"))
	var particles_material := _particles.process_material as ParticleProcessMaterial
	particles_material.color = Color("edf6ff") if _season == "WINTER" else Color("e9ad54") if _season == "AUTUMN" else Color("e0edbe") if _season == "SPRING" else Color("f4dc90")
	particles_material.gravity = Vector3(0.6, -0.65, 0.15) if _season == "WINTER" else Vector3(0.15, -0.35, 0)
	var particle_count := 220 if _season == "WINTER" else 100 if _season == "AUTUMN" else 65 if _season == "SPRING" else 30
	_particles.amount = maxi(12, int(particle_count * (0.25 if quality_preset == "low" else 0.6 if quality_preset == "balanced" else 1.0)))
	var weather_mesh: PrimitiveMesh
	if _season == "AUTUMN":
		var leaf := PrismMesh.new()
		leaf.size = Vector3(0.13, 0.018, 0.065)
		weather_mesh = leaf
	elif _season == "SPRING":
		var petal := SphereMesh.new()
		petal.radius = 0.04
		petal.height = 0.035
		petal.radial_segments = 5
		petal.rings = 3
		weather_mesh = petal
	else:
		var flake := SphereMesh.new()
		flake.radius = 0.045 if _season == "WINTER" else 0.025
		flake.height = flake.radius * 2.0
		flake.radial_segments = 4
		flake.rings = 2
		weather_mesh = flake
	weather_mesh.material = Factory.material(particles_material.color, 0.0, 0.9)
	_particles.draw_pass_1 = weather_mesh
	_particles.restart()
	_update_territory_colors()

func _process(delta: float) -> void:
	_elapsed += delta
	if _dragging and not Input.is_mouse_button_pressed(MOUSE_BUTTON_MIDDLE):
		_dragging = false
	var focus := get_viewport().gui_get_focus_owner()
	if not (focus is LineEdit or focus is TextEdit):
		var direction := Vector2(float(Input.is_physical_key_pressed(KEY_D)) - float(Input.is_physical_key_pressed(KEY_A)), float(Input.is_physical_key_pressed(KEY_S)) - float(Input.is_physical_key_pressed(KEY_W)))
		if direction.length_squared() > 0:
			var planar := Vector3(direction.x, 0, direction.y).rotated(Vector3.UP, _yaw)
			_target += planar.normalized() * delta * (_distance * 0.35)
		if Input.is_physical_key_pressed(KEY_Q):
			_yaw += delta * 0.65
		if Input.is_physical_key_pressed(KEY_E):
			_yaw -= delta * 0.65
	_target.x = clampf(_target.x, -19, 19)
	_target.z = clampf(_target.z, -10, 10)
	_update_camera(delta)
	for id in _armies:
		var prop: Node3D = _armies[id]
		if bool(prop.get_meta("is_ship", false)) and (not _tweens.has(id) or not _tweens[id].is_running()):
			var phase := float(abs(str(id).hash()) % 100) * 0.1
			prop.rotation.z = sin(_elapsed * 1.2 + phase) * 0.035
			prop.rotation.x = cos(_elapsed * 0.9 + phase) * 0.025
			prop.position.y = float(prop.get_meta("rest_y", 0.0)) + sin(_elapsed * 1.1 + phase) * 0.025
	_update_selection()

func _update_camera(delta: float) -> void:
	var weight := 1.0 - exp(-delta * 12.0)
	_camera_target = _camera_target.lerp(_target, weight)
	_smooth_distance = lerpf(_smooth_distance, _distance, weight)
	_camera.position = _camera_target + Vector3(sin(_yaw) * cos(_pitch), sin(_pitch), cos(_yaw) * cos(_pitch)) * _smooth_distance
	_camera.look_at(_camera_target, Vector3.UP)

func _update_selection() -> void:
	if not is_instance_valid(_selection):
		return
	if _armies.has(selected_battalion_id):
		_selection.position = _armies[selected_battalion_id].position + Vector3(0, 0.025, 0)
		_selection.visible = true
	elif _provinces.has(selected_province_id):
		_selection.position = _province_position(selected_province_id) + Vector3(0, 0.045, 0)
		_selection.visible = true
	else:
		_selection.visible = false

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_F6:
		var presets := ["high", "balanced", "low"]
		set_quality(presets[(presets.find(quality_preset) + 1) % presets.size()])
		get_viewport().set_input_as_handled()
	elif event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_MIDDLE:
			_dragging = event.pressed
			_orbiting = event.alt_pressed
			get_viewport().set_input_as_handled()
		elif event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_distance = clampf(_distance * 0.9, 8.0, 65.0)
			get_viewport().set_input_as_handled()
		elif event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_distance = clampf(_distance * 1.1, 8.0, 65.0)
			get_viewport().set_input_as_handled()
		elif event.pressed and event.button_index in [MOUSE_BUTTON_LEFT, MOUSE_BUTTON_RIGHT]:
			_pick(event.position, event.button_index == MOUSE_BUTTON_RIGHT)
	elif event is InputEventMouseMotion and _dragging:
		if _orbiting:
			_yaw -= event.relative.x * 0.006
			_pitch = clampf(_pitch + event.relative.y * 0.004, 0.45, 1.4)
		else:
			_target += Vector3(-event.relative.x, 0, -event.relative.y).rotated(Vector3.UP, _yaw) * (_distance * 0.0013)
		get_viewport().set_input_as_handled()

func _pick(screen_point: Vector2, command: bool) -> void:
	var origin := _camera.project_ray_origin(screen_point)
	var target := origin + _camera.project_ray_normal(screen_point) * 200.0
	var query := PhysicsRayQueryParameters3D.create(origin, target)
	var result := get_world_3d().direct_space_state.intersect_ray(query)
	if result.is_empty():
		return
	var collider: Object = result["collider"]
	var province_id := str(collider.get_meta("province_id", ""))
	if province_id.is_empty():
		return
	if command:
		territory_command.emit(province_id)
		if not selected_battalion_id.is_empty():
			move_requested.emit(selected_battalion_id, province_id)
	else:
		selected_province_id = province_id
		var battalion_id := str(collider.get_meta("battalion_id", ""))
		if not battalion_id.is_empty():
			selected_battalion_id = battalion_id
			battalion_selected.emit(battalion_id)
		else:
			territory_selected.emit(province_id)
		_update_selection()
	get_viewport().set_input_as_handled()
