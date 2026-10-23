class_name Props3DFactory
extends RefCounted
## Procedural tabletop miniatures. Meshes/materials are shared between instances.

static var _materials: Dictionary = {}
static var _meshes: Dictionary = {}

static func material(color: Color, metallic: float = 0.0, roughness: float = 0.7) -> StandardMaterial3D:
	var key := color.to_html() + ":" + str(metallic) + ":" + str(roughness)
	if _materials.has(key):
		return _materials[key]
	var result := StandardMaterial3D.new()
	result.albedo_color = color
	result.metallic = metallic
	result.roughness = roughness
	_materials[key] = result
	return result

static func _box(parent: Node3D, size: Vector3, position: Vector3, mat: Material) -> MeshInstance3D:
	var key := "box:" + str(size)
	if not _meshes.has(key):
		var shape := BoxMesh.new()
		shape.size = size
		_meshes[key] = shape
	return _instance(parent, _meshes[key], position, mat)

static func _cylinder(parent: Node3D, radius: float, height: float, position: Vector3, mat: Material, top_radius: float = -1.0) -> MeshInstance3D:
	var top := radius if top_radius < 0.0 else top_radius
	var key := "cylinder:%s:%s:%s" % [radius, top, height]
	if not _meshes.has(key):
		var shape := CylinderMesh.new()
		shape.bottom_radius = radius
		shape.top_radius = top
		shape.height = height
		shape.radial_segments = 12
		shape.rings = 1
		_meshes[key] = shape
	return _instance(parent, _meshes[key], position, mat)

static func _sphere(parent: Node3D, radius: float, position: Vector3, mat: Material) -> MeshInstance3D:
	var key := "sphere:" + str(radius)
	if not _meshes.has(key):
		var shape := SphereMesh.new()
		shape.radius = radius
		shape.height = radius * 2.0
		shape.radial_segments = 12
		shape.rings = 6
		_meshes[key] = shape
	return _instance(parent, _meshes[key], position, mat)

static func _instance(parent: Node3D, mesh: Mesh, position: Vector3, mat: Material) -> MeshInstance3D:
	var instance := MeshInstance3D.new()
	instance.mesh = mesh
	instance.material_override = mat
	instance.position = position
	parent.add_child(instance)
	return instance

static func _pick_body(parent: Node3D, size: Vector3, position: Vector3, province_id: String, battalion_id: String = "") -> void:
	var body := StaticBody3D.new()
	body.set_meta("province_id", province_id)
	if not battalion_id.is_empty():
		body.set_meta("battalion_id", battalion_id)
	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = size
	collision.shape = shape
	collision.position = position
	body.add_child(collision)
	parent.add_child(body)

static func _label(parent: Node3D, text: String, position: Vector3, size: int = 42) -> Label3D:
	var label := Label3D.new()
	label.text = text
	label.position = position
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.font_size = size
	label.pixel_size = 0.007
	label.outline_size = 8
	label.outline_modulate = Color("101b27")
	label.modulate = Color("fff2c9")
	label.no_depth_test = false
	label.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(label)
	return label

static func army_variant(army: Dictionary) -> String:
	if int(army.get("artillery", 0)) > 0:
		return "cannon"
	if int(army.get("cavalry", 0)) > 0:
		return "cavalry"
	return "infantry"

static func troop_count(army: Dictionary) -> int:
	var total := 0
	for key in ["infantry", "cavalry", "artillery", "warships", "transports"]:
		total += int(army.get(key, 0))
	return total

static func create_army_prop_3d(army: Dictionary, nation_color: Color) -> Node3D:
	var root := Node3D.new()
	root.name = "Army_" + str(army.get("id", "unit"))
	root.set_meta("variant", army_variant(army))
	root.set_meta("province_id", str(army.get("provinceId", "")))
	root.set_meta("battalion_id", str(army.get("id", "")))
	var bronze := material(Color("b28b48"), 0.75, 0.33)
	var dark_bronze := material(Color("513d25"), 0.55, 0.55)
	var wood := material(Color("563820"), 0.0, 0.85)
	var steel := material(Color("9aadb4"), 0.8, 0.35)
	var cloth := material(nation_color.lightened(0.12))
	_cylinder(root, 0.57, 0.12, Vector3(0, 0.06, 0), bronze)
	_cylinder(root, 0.51, 0.09, Vector3(0, 0.16, 0), material(nation_color.darkened(0.15), 0.3))
	match army_variant(army):
		"cannon":
			_box(root, Vector3(0.5, 0.12, 0.68), Vector3(0, 0.38, 0.03), wood)
			var barrel := _cylinder(root, 0.14, 0.9, Vector3(0, 0.64, -0.15), bronze, 0.10)
			barrel.rotation.x = PI / 2.0 - 0.12
			var bore := _cylinder(root, 0.075, 0.015, Vector3(0, 0.69, -0.60), material(Color("141619")))
			bore.rotation.x = PI / 2.0
			for side in [-1.0, 1.0]:
				var wheel := _cylinder(root, 0.28, 0.12, Vector3(side * 0.34, 0.4, 0.08), wood)
				wheel.rotation.z = PI / 2.0
				var hub := _cylinder(root, 0.075, 0.14, Vector3(side * 0.35, 0.4, 0.08), bronze)
				hub.rotation.z = PI / 2.0
				for spoke in [0.0, PI / 3.0, PI * 2.0 / 3.0]:
					var timber := _box(root, Vector3(0.125, 0.42, 0.035), Vector3(side * 0.35, 0.4, 0.08), dark_bronze)
					timber.rotation.x = spoke
			var axle := _cylinder(root, 0.055, 0.85, Vector3(0, 0.4, 0.08), steel)
			axle.rotation.z = PI / 2.0
		"cavalry":
			_sphere(root, 0.22, Vector3(0, 0.65, 0), dark_bronze).scale = Vector3(0.85, 0.9, 1.8)
			for x in [-0.14, 0.14]:
				for z in [-0.22, 0.23]:
					_cylinder(root, 0.045, 0.35, Vector3(x, 0.38, z), dark_bronze)
			var neck := _cylinder(root, 0.12, 0.38, Vector3(0, 0.83, -0.27), dark_bronze)
			neck.rotation.x = -0.38
			_sphere(root, 0.15, Vector3(0, 1.02, -0.34), dark_bronze).scale = Vector3(0.7, 0.85, 1.3)
			_cylinder(root, 0.12, 0.35, Vector3(0, 0.95, 0.06), steel)
			_sphere(root, 0.12, Vector3(0, 1.18, 0.06), steel)
			_add_standard(root, Vector3(0.25, 0.27, 0.16), 1.5, cloth, bronze)
		_:
			for offset in [Vector3(-0.2, 0, -0.08), Vector3(0.18, 0, 0.12), Vector3(0, 0, 0.26)]:
				_cylinder(root, 0.11, 0.42, offset + Vector3(0, 0.46, 0), steel)
				_sphere(root, 0.12, offset + Vector3(0, 0.77, 0), steel)
				var shield := _cylinder(root, 0.19, 0.06, offset + Vector3(0, 0.51, -0.12), cloth)
				shield.rotation.x = PI / 2.0
				_cylinder(root, 0.017, 1.1, offset + Vector3(0.18, 0.79, 0), wood)
				_cylinder(root, 0.065, 0.15, offset + Vector3(0.18, 1.41, 0), steel, 0.0)
			_add_standard(root, Vector3(-0.3, 0.23, 0.23), 1.4, cloth, bronze)
	_bake_static_geometry(root, "army:" + army_variant(army) + ":" + nation_color.to_html())
	_add_summary(root, army, 1.8)
	_pick_body(root, Vector3(1.15, 1.7, 1.15), Vector3(0, 0.85, 0), str(army.get("provinceId", "")), str(army.get("id", "")))
	return root

static func _add_standard(parent: Node3D, foot: Vector3, height: float, cloth: Material, bronze: Material) -> void:
	_cylinder(parent, 0.025, height, foot + Vector3(0, height / 2.0, 0), bronze)
	_sphere(parent, 0.055, foot + Vector3(0, height, 0), bronze)
	_box(parent, Vector3(0.42, 0.27, 0.035), foot + Vector3(0.2, height - 0.2, 0), cloth)

static func _add_summary(root: Node3D, army: Dictionary, height: float) -> void:
	var label := _label(root, str(troop_count(army)), Vector3(0, height, 0), 52)
	label.name = "TroopCount"
	var background := _box(root, Vector3(1.0, 0.07, 0.05), Vector3(0, height - 0.22, 0), material(Color("202932")))
	background.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var bar := _box(root, Vector3(1.0, 0.075, 0.06), Vector3(0, height - 0.22, -0.01), material(Color("75c690")))
	bar.name = "MoraleBar"
	bar.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	update_army_prop(root, army)

static func update_army_prop(root: Node3D, army: Dictionary) -> void:
	var label := root.get_node_or_null("TroopCount") as Label3D
	if label:
		label.text = str(troop_count(army))
	var bar := root.get_node_or_null("MoraleBar") as MeshInstance3D
	if bar:
		var ratio := clampf(float(army.get("morale", 0)) / 100.0, 0.01, 1.1)
		bar.scale.x = ratio
		bar.position.x = (ratio - 1.0) * 0.5
		bar.material_override = material(Color("d9645b") if ratio < 0.4 else Color("dbc176") if ratio < 0.7 else Color("75c690"))
	var province_id := str(army.get("provinceId", ""))
	root.set_meta("province_id", province_id)
	for child in root.get_children():
		if child is StaticBody3D:
			child.set_meta("province_id", province_id)

static func create_ship_prop_3d(army: Dictionary, nation_color: Color) -> Node3D:
	var root := Node3D.new()
	root.name = "Fleet_" + str(army.get("id", "unit"))
	root.set_meta("variant", "ship")
	root.set_meta("province_id", str(army.get("provinceId", "")))
	root.set_meta("battalion_id", str(army.get("id", "")))
	var wood := material(Color("563820"), 0.0, 0.75)
	var deck := material(Color("a17b44"), 0.0, 0.85)
	var bronze := material(Color("c4a363"), 0.7, 0.4)
	var hull_points := PackedVector2Array([Vector2(0, -0.9), Vector2(0.36, -0.51), Vector2(0.44, 0.43), Vector2(0.26, 0.76), Vector2(-0.26, 0.76), Vector2(-0.44, 0.43), Vector2(-0.36, -0.51)])
	_instance(root, extruded_mesh(hull_points, 0.0, 0.37), Vector3.ZERO, wood)
	_instance(root, extruded_mesh(hull_points, 0.37, 0.41), Vector3.ZERO, deck)
	for side in [-1.0, 1.0]:
		_box(root, Vector3(0.055, 0.13, 1.12), Vector3(side * 0.38, 0.47, 0), bronze)
		for z in [-0.33, 0.0, 0.33]:
			var cannon := _cylinder(root, 0.045, 0.22, Vector3(side * 0.4, 0.37, z), bronze)
			cannon.rotation.z = PI / 2.0
	for z in [-0.4, 0.33]:
		_cylinder(root, 0.033, 1.55, Vector3(0, 1.1, z), wood)
		var sail := MeshInstance3D.new()
		sail.mesh = _sail_mesh()
		sail.position = Vector3(0, 0.72, z - 0.03)
		sail.material_override = material(nation_color.lightened(0.48))
		root.add_child(sail)
		var yard := _cylinder(root, 0.02, 1.12, Vector3(0, 1.61, z), wood)
		yard.rotation.z = PI / 2.0
	_add_standard(root, Vector3(0, 0.43, 0.67), 1.65, material(nation_color), bronze)
	_box(root, Vector3(0.46, 0.22, 0.35), Vector3(0, 0.55, 0.5), wood)
	_bake_static_geometry(root, "ship:" + nation_color.to_html())
	_add_summary(root, army, 2.45)
	_pick_body(root, Vector3(1.15, 2.15, 1.9), Vector3(0, 1.05, 0), str(army.get("provinceId", "")), str(army.get("id", "")))
	return root

static func _sail_mesh() -> ArrayMesh:
	if _meshes.has("sail"):
		return _meshes["sail"]
	var vertices := PackedVector3Array()
	for segment in range(6):
		var x0 := float(segment) / 6.0
		var x1 := float(segment + 1) / 6.0
		var a := Vector3((x0 - 0.5) * 1.06, 0, sin(x0 * PI) * 0.19)
		var b := Vector3((x1 - 0.5) * 1.06, 0, sin(x1 * PI) * 0.19)
		var c := a + Vector3(0, 0.85, -0.04)
		var d := b + Vector3(0, 0.85, -0.04)
		vertices.append_array(PackedVector3Array([a, b, c, b, d, c, c, b, a, c, d, b]))
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	surface.set_smooth_group(-1)
	for vertex in vertices:
		surface.add_vertex(vertex)
	surface.generate_normals()
	var mesh := surface.commit()
	_meshes["sail"] = mesh
	return mesh

static func create_structure_prop_3d(building: String, level: int, nation_color: Color, province_id: String = "") -> Node3D:
	var root := Node3D.new()
	root.name = "Structure_" + building
	root.set_meta("province_id", province_id)
	var stone := material(Color("a7a28e"), 0.05, 0.85)
	var stone_dark := material(Color("656f70"), 0.1, 0.8)
	var wood := material(Color("674927"), 0.0, 0.85)
	var cloth := material(nation_color.lightened(0.2))
	var gold := material(Color("caa154"), 0.7, 0.35)
	match building:
		"FORT":
			_box(root, Vector3(1.0, 0.65, 0.8), Vector3(0, 0.32, 0), stone)
			for x in [-0.43, 0.43]:
				for z in [-0.33, 0.33]:
					_cylinder(root, 0.19, 0.9, Vector3(x, 0.45, z), stone_dark)
					for index in range(6):
						var angle := index * TAU / 6.0
						_box(root, Vector3(0.09, 0.14, 0.09), Vector3(x + cos(angle) * 0.14, 0.96, z + sin(angle) * 0.14), stone)
			for x in [-0.3, -0.1, 0.1, 0.3]:
				_box(root, Vector3(0.1, 0.15, 0.13), Vector3(x, 0.72, -0.36), stone)
			_box(root, Vector3(0.2, 0.35, 0.03), Vector3(0, 0.17, -0.415), wood)
			_add_standard(root, Vector3(0.34, 0.9, 0.24), 0.55, cloth, gold)
		"BARRACKS", "MARKET":
			_box(root, Vector3(1.0, 0.08, 0.82), Vector3(0, 0.04, 0), wood)
			var roof := PrismMesh.new()
			roof.size = Vector3(1.0, 0.65, 0.8)
			_instance(root, roof, Vector3(0, 0.4, 0), cloth)
			for x in [-0.43, 0.43]:
				_cylinder(root, 0.025, 0.55, Vector3(x, 0.28, -0.37), wood)
			if building == "MARKET":
				for point in [Vector3(-0.52, 0.14, -0.48), Vector3(0.35, 0.13, -0.52), Vector3(0.6, 0.25, 0.15)]:
					_box(root, Vector3(0.22, 0.25, 0.24), point, wood)
					_cylinder(root, 0.06, 0.035, point + Vector3(0, 0.15, 0), gold)
			else:
				for x in [-0.3, -0.13, 0.04]:
					_cylinder(root, 0.015, 0.7, Vector3(x, 0.35, -0.54), wood)
					_cylinder(root, 0.055, 0.12, Vector3(x, 0.75, -0.54), stone_dark, 0.0)
		"PORT":
			_box(root, Vector3(0.42, 0.1, 1.2), Vector3(0, 0.12, 0.1), wood)
			for z in [-0.3, 0.1, 0.5]:
				for x in [-0.17, 0.17]:
					_cylinder(root, 0.04, 0.42, Vector3(x, 0.06, z), wood)
			_cylinder(root, 0.2, 0.95, Vector3(0.34, 0.48, -0.28), stone, 0.12)
			_cylinder(root, 0.22, 0.12, Vector3(0.34, 1.0, -0.28), gold)
			_sphere(root, 0.12, Vector3(0.34, 1.15, -0.28), material(Color("ffe5a0"), 0.4, 0.25))
		"FOUNDRY":
			_box(root, Vector3(0.8, 0.6, 0.7), Vector3(0, 0.3, 0), stone_dark)
			_box(root, Vector3(0.18, 0.9, 0.18), Vector3(0.25, 0.75, 0.18), stone)
			_box(root, Vector3(0.26, 0.21, 0.035), Vector3(0, 0.22, -0.36), material(Color("d78235"), 0.2))
		"TEMPLE":
			_box(root, Vector3(0.75, 0.55, 0.85), Vector3(0, 0.28, 0), stone)
			_cylinder(root, 0.2, 0.8, Vector3(0, 0.8, 0.14), stone, 0.14)
			_cylinder(root, 0.24, 0.34, Vector3(0, 1.34, 0.14), gold, 0.0)
			_box(root, Vector3(0.08, 0.25, 0.08), Vector3(0, 1.62, 0.14), gold)
	if level > 1:
		_label(root, str(level), Vector3(0.65, 0.65, 0), 32)
	_bake_static_geometry(root, "building:" + building + ":" + nation_color.to_html())
	_pick_body(root, Vector3(1.25, 1.5, 1.4), Vector3(0, 0.6, 0), province_id)
	return root

static func extruded_mesh(polygon: PackedVector2Array, bottom: float, top: float) -> ArrayMesh:
	polygon = polygon.duplicate()
	if Geometry2D.is_polygon_clockwise(polygon):
		polygon.reverse()
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	surface.set_smooth_group(-1)
	var indices := Geometry2D.triangulate_polygon(polygon)
	for index in range(0, indices.size(), 3):
		for corner in [0, 1, 2]:
			var point := polygon[indices[index + corner]]
			surface.add_vertex(Vector3(point.x, top, point.y))
	for index in polygon.size():
		var a := polygon[index]
		var b := polygon[(index + 1) % polygon.size()]
		for point in [Vector3(a.x, bottom, a.y), Vector3(a.x, top, a.y), Vector3(b.x, top, b.y), Vector3(a.x, bottom, a.y), Vector3(b.x, top, b.y), Vector3(b.x, bottom, b.y)]:
			surface.add_vertex(point)
	surface.generate_normals()
	return surface.commit()

static func bake_static_geometry(root: Node3D, cache_key: String, cast_shadows: bool = true) -> void:
	_bake_static_geometry(root, cache_key, cast_shadows)

static func _bake_static_geometry(root: Node3D, cache_key: String, cast_shadows: bool = true) -> void:
	# One reusable mesh per miniature, grouped by material. Labels and the dynamic
	# morale bar remain separate. This removes dozens of draw calls per fortress.
	var instances: Array[MeshInstance3D] = []
	for child in root.get_children():
		if child is MeshInstance3D:
			instances.append(child)
	var key := "baked:" + cache_key
	if not _meshes.has(key):
		var groups: Dictionary = {}
		for instance in instances:
			var mat: Material = instance.material_override
			var material_key := mat.get_instance_id()
			if not groups.has(material_key):
				groups[material_key] = {"material": mat, "instances": []}
			groups[material_key]["instances"].append(instance)
		var combined := ArrayMesh.new()
		for group in groups.values():
			var surface := SurfaceTool.new()
			surface.begin(Mesh.PRIMITIVE_TRIANGLES)
			surface.set_material(group["material"])
			for instance: MeshInstance3D in group["instances"]:
				var normal_basis := instance.transform.basis.inverse().transposed()
				for surface_index in instance.mesh.get_surface_count():
					var arrays := instance.mesh.surface_get_arrays(surface_index)
					var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
					var normals: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
					var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX] if arrays[Mesh.ARRAY_INDEX] != null else PackedInt32Array()
					var vertex_count := indices.size() if not indices.is_empty() else vertices.size()
					for item in vertex_count:
						var index := indices[item] if not indices.is_empty() else item
						var normal := (normal_basis * normals[index]).normalized() if not normals.is_empty() else Vector3.UP
						surface.set_normal(normal)
						surface.set_uv(Vector2.ZERO)
						surface.add_vertex(instance.transform * vertices[index])
			surface.commit(combined)
		_meshes[key] = combined
	for instance in instances:
		root.remove_child(instance)
		instance.free()
	var baked := MeshInstance3D.new()
	baked.name = "MiniatureGeometry"
	baked.mesh = _meshes[key]
	if not cast_shadows:
		baked.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(baked)
