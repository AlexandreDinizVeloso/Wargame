extends SceneTree
## Run headless for contracts, or with -- --capture to save real 3D screenshots.
var _failures: Array[String] = []
var _picked_province := ""
var _commanded_province := ""

func _initialize() -> void:
	_run.call_deferred()

func _check(condition: bool, message: String) -> void:
	if not condition:
		_failures.append(message)
		push_error(message)

func _run() -> void:
	root.size = Vector2i(1440, 810)
	var script := load("res://scripts/WarTable3D.gd")
	if not script:
		quit(1)
		return
	var table: Node3D = script.new()
	root.add_child(table)
	await process_frame
	var bootstrap: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/bootstrap.json"))
	var game := {"code": "RENDER", "turn": 1, "season": "SPRING", "players": [], "provinces": bootstrap["map"].duplicate(true), "battalions": []}
	var colors := ["#397a98", "#aa4b48", "#d5aa54", "#8d65a3", "#4f926a", "#ac7961", "#608db6", "#b280a7"]
	var homes := ["castile", "arabia", "south-africa", "nile", "scandinavia", "mongolia", "china-east", "brazil"]
	for index in range(8):
		game["players"].append({"id": "p" + str(index), "color": colors[index]})
		for province in game["provinces"]:
			if str(province["id"]) == homes[index]:
				province["ownerId"] = "p" + str(index)
		game["battalions"].append({"id": "army" + str(index), "ownerId": "p" + str(index), "provinceId": homes[index], "infantry": 4, "cavalry": 2 if index % 3 == 1 else 0, "artillery": 2 if index % 3 == 2 else 0, "warships": 0, "transports": 0, "morale": 55 + index * 5, "isFleet": false})
	game["battalions"].append({"id": "fleet", "ownerId": "p0", "provinceId": "south-pacific", "infantry": 0, "cavalry": 0, "artillery": 0, "warships": 3, "transports": 2, "morale": 95, "isFleet": true})
	for province in game["provinces"]:
		if str(province["id"]) == "castile":
			for field in ["fortLevel", "marketLevel", "barracksLevel", "portLevel", "foundryLevel", "templeLevel"]:
				province[field] = 1
	table.apply_state(game, "p0")
	await physics_frame
	await process_frame
	_check(table._territories.size() == 42, "Expected 42 real land meshes")
	_check(table._armies.size() == 9, "Expected eight armies plus a physical galleon")
	_check(table._structures.size() == 6, "Expected all six physical structure variants")
	var colliders := 0
	for node in table._terrain_root.get_children():
		if node is StaticBody3D and node.has_meta("province_id"):
			colliders += 1
	_check(colliders == 52, "All42 lands and10 sea nodes need physical selection bodies")
	_check(is_equal_approx(float(table._heights["andes"]), 0.85), "Mountains must extrude to0.85")
	_check(is_equal_approx(float(table._heights["castile"]), 0.35), "Ordinary lands must extrude to0.35")
	_check(is_equal_approx(table.camera_node().fov, 45.0), "Tactical camera must use45 degreeFOV")
	for id in table._territories:
		var mesh_instance: MeshInstance3D = table._territories[id]
		_check(mesh_instance.mesh.get_surface_count() > 0, "Territory has no mesh: " + str(id))
		_check(mesh_instance.get_parent() is StaticBody3D, "Territory lacks raycast collider: " + str(id))
		var arrays: Array = mesh_instance.mesh.surface_get_arrays(0)
		var normals: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
		_check(not normals.is_empty() and normals[0].y > 0.99, "Top surface must face upward for rendering: " + str(id))
	for id in table._armies:
		var prop: Node3D = table._armies[id]
		_check(prop.get_node_or_null("TroopCount") is Label3D, "Army must display 3D troop count")
		_check(prop.get_node_or_null("MoraleBar") is MeshInstance3D, "Army must display a 3D morale bar")
	var original_mesh: Mesh = table._territories["castile"].mesh
	var factory := load("res://scripts/Props3DFactory.gd")
	var deck: ArrayMesh = factory.extruded_mesh(PackedVector2Array([Vector2.ZERO, Vector2(1, 0), Vector2(1, 1), Vector2(0, 1)]), 0.0, 0.35)
	var deck_normals: PackedVector3Array = deck.surface_get_arrays(0)[Mesh.ARRAY_NORMAL]
	_check(deck_normals[0].y > 0.99, "Ship deck must face upward, not disappear through backface culling")
	table.apply_state(game, "p0")
	_check(table._territories["castile"].mesh == original_mesh, "Polling must not rebuild terrain")
	table.territory_selected.connect(func(id: String) -> void: _picked_province = id)
	table.territory_command.connect(func(id: String) -> void: _commanded_province = id)
	var pick_point: Vector3 = table._province_position("france") + Vector3(0, 0.01, 0)
	var screen: Vector2 = table.camera_node().unproject_position(pick_point)
	table._pick(screen, false)
	_check(_picked_province == "france", "Left raycast must select the physical territory")
	for province in game["provinces"]:
		if str(province.get("kind", "LAND")) == "SEA_ZONE" and str(province["id"]) != "south-pacific":
			var sea_id := str(province["id"])
			var token_position: Vector3 = table._province_position(sea_id)
			token_position.y = 0.12
			var sea_screen: Vector2 = table.camera_node().unproject_position(token_position)
			table._pick(sea_screen, false)
			if _picked_province != sea_id:
				var origin: Vector3 = table.camera_node().project_ray_origin(sea_screen)
				var hit: Dictionary = table.get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(origin, origin + table.camera_node().project_ray_normal(sea_screen) * 200.0))
				print("SEA_PICK_DEBUG ", sea_id, " hit=", hit.get("collider"), " at=", table._province_position(sea_id))
			_check(_picked_province == sea_id, "Sea compass must remain visible to raycasts: " + sea_id)
	table.select_battalion("army0")
	table._pick(screen, true)
	_check(_commanded_province == "france", "Right raycast must preserve destination province")
	game["battalions"][0]["provinceId"] = "france"
	game["battalions"][0]["infantry"] = 7
	table.apply_state(game, "p0")
	await create_timer(0.8).timeout
	var moved: Node3D = table._armies["army0"]
	_check(str(moved.get_meta("province_id")) == "france", "Moving prop must update its hit metadata")
	_check(moved.position.distance_to(table._province_position("france")) < 0.5, "Movement must tween into target territory")
	_check(moved.get_node("TroopCount").text == "7", "Prop count must reflect authoritative composition")
	var capture := "--capture" in OS.get_cmdline_user_args()
	if capture:
		await create_timer(2.0).timeout
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../.local/screenshots/godot-v110-spring.png"))
		print("RENDER_FPS_SAMPLE=", Engine.get_frames_per_second())
		print("RENDER_METRICS quality=", table.quality_preset, " adapter=", RenderingServer.get_video_adapter_name(), " draws=", Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME), " objects=", Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME), " triangles=", Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME))
	game["season"] = "WINTER"
	game["turn"] = 10
	table.apply_state(game, "p0")
	var expected_snow := 55 if table.quality_preset == "low" else 132 if table.quality_preset == "balanced" else 220
	_check(table._particles.amount == expected_snow, "Winter must enable the quality-specific snowfall population")
	_check(table._season == "WINTER", "Season lighting must follow authoritative state")
	if capture:
		await create_timer(1.5).timeout
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(ProjectSettings.globalize_path("res://../.local/screenshots/godot-v110-winter.png"))
	if _failures.is_empty():
		print("GODOT_RENDER_OK territories=42 armies=9 structures=6 raycast=tween=seasons=PASS")
	else:
		print("GODOT_RENDER_FAILED=", _failures)
	table.queue_free()
	await process_frame
	quit(0 if _failures.is_empty() else 1)
