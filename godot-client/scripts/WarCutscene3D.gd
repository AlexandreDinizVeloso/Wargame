extends CanvasLayer
## A separate 3D stage animates heraldic shields without rebuilding the war table.
const SEASON_NAMES := {"SPRING":"PRIMAVERA", "SUMMER":"VERÃO", "AUTUMN":"OUTONO", "WINTER":"INVERNO"}
const SEASON_DESCRIPTIONS := {
	"SPRING":"Despertar e Mobilização\nRecrutas ×2 · Rios: −25% ataque · Três rodadas",
	"SUMMER":"Era das Grandes Campanhas\n+1 movimento · +15% ataque · +1 cerco · Três rodadas",
	"AUTUMN":"Colheita e Frota Mercante\nComércio ×2 · Mercados e Portos −25% · Três rodadas",
	"WINTER":"O Grande Inverno Implacável\nFora de terra própria pacificada: mínimo de 20% atrito e −15 moral\nExércitos em campanha: +50% manutenção · Três rodadas",
}
const SEASON_COLORS := {"SPRING":Color("74d5a0"), "SUMMER":Color("f4ce6d"), "AUTUMN":Color("e19a53"), "WINTER":Color("c3e7f9")}
const CB_NAMES := {"CONQUEST":"Conquista Imperial", "HOLY_WAR":"Guerra Religiosa", "IMPERIAL_BAN":"Banimento Imperial", "HUMILIATION":"Humilhação", "COALITION":"Guerra de Coalizão"}
var _overlay: ColorRect
var _content: VBoxContainer
var _title: Label
var _subtitle: Label
var _comparison: Label
var _button: Button
var _stage: SubViewportContainer
var _viewport: SubViewport
var _shields_root: Node3D
var _timer: Timer
var _queue: Array[Dictionary] = []
var _active := false
var _war_ids: Dictionary = {}
var _season_keys: Dictionary = {}
var _animation: Tween

func _ready() -> void:
	_overlay = ColorRect.new()
	_overlay.color = Color(0.025, 0.03, 0.04, 0.97)
	_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(_overlay)
	_overlay.hide()
	_content = VBoxContainer.new()
	_content.position = Vector2(300, 130)
	_content.size = Vector2(1320, 820)
	_content.alignment = BoxContainer.ALIGNMENT_CENTER
	_content.add_theme_constant_override("separation", 25)
	_overlay.add_child(_content)
	_title = _label("", 66)
	_title.add_theme_color_override("font_color", Color("edcb83"))
	if ResourceLoader.exists("res://data/fonts/Cinzel.ttf"):
		_title.add_theme_font_override("font", load("res://data/fonts/Cinzel.ttf"))
	_content.add_child(_title)
	_subtitle = _label("", 28)
	_content.add_child(_subtitle)
	_stage = SubViewportContainer.new()
	_stage.custom_minimum_size = Vector2(1200, 350)
	_stage.stretch = true
	_stage.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_content.add_child(_stage)
	_viewport = SubViewport.new()
	_viewport.size = Vector2i(1200, 350)
	_viewport.transparent_bg = true
	_viewport.own_world_3d = true
	_viewport.render_target_update_mode = SubViewport.UPDATE_WHEN_VISIBLE
	_stage.add_child(_viewport)
	var camera := Camera3D.new()
	camera.position = Vector3(0, 0, 8)
	camera.fov = 40
	_viewport.add_child(camera)
	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-30, -25, 0)
	light.light_color = Color("ffdfae")
	light.light_energy = 2
	_viewport.add_child(light)
	var world := WorldEnvironment.new()
	world.environment = Environment.new()
	world.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	world.environment.ambient_light_color = Color("a8b6ca")
	world.environment.ambient_light_energy = 0.8
	_viewport.add_child(world)
	_shields_root = Node3D.new()
	_viewport.add_child(_shields_root)
	_comparison = _label("", 23)
	_content.add_child(_comparison)
	_button = Button.new()
	_button.text = "ÀS ARMAS!"
	_button.custom_minimum_size = Vector2(350, 64)
	_button.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_button.add_theme_font_size_override("font_size", 26)
	_button.pressed.connect(_finish)
	_content.add_child(_button)
	_timer = Timer.new()
	_timer.one_shot = true
	_timer.timeout.connect(_finish)
	add_child(_timer)

func observe_state(game: Dictionary, previous: Dictionary, player_id: String) -> void:
	if str(game.get("phase", "")) != "planning": return
	var room := str(game.get("code", ""))
	var turn := int(game.get("turn", 1))
	var season := str(game.get("season", "SPRING"))
	var season_key := room + ":" + str(int(floor(float(turn - 1) / 3.0)))
	if not _season_keys.has(season_key) and (turn == 1 or not previous.is_empty() and season != str(previous.get("season", ""))):
		_season_keys[season_key] = true
		_queue.append({"kind":"season", "season":season})
	for war in game.get("wars", []):
		var key := room + ":" + str(war.get("id", ""))
		if _war_ids.has(key): continue
		_war_ids[key] = true
		if previous.is_empty() or not war.get("active", false): continue
		if player_id in war.get("attackerIds", []) or player_id in war.get("defenderIds", []):
			_queue.append({"kind":"war", "war":war, "game":game})
	_show_next()

func _show_next() -> void:
	if _active or _queue.is_empty(): return
	_active = true
	_overlay.show()
	var item: Dictionary = _queue.pop_front()
	var is_war := str(item.kind) == "war"
	_stage.visible = is_war
	_button.visible = is_war
	_comparison.visible = is_war
	if is_war:
		_show_war(item.war, item.game)
	else:
		var season := str(item.season)
		_title.text = str(SEASON_NAMES.get(season, season))
		_title.modulate = SEASON_COLORS.get(season, Color.WHITE)
		_subtitle.text = str(SEASON_DESCRIPTIONS.get(season, ""))
		_timer.start(2.5)
	if _animation and _animation.is_valid(): _animation.kill()
	_title.modulate.a = 0
	_animation = create_tween()
	_animation.tween_property(_title, "modulate:a", 1.0, 0.35)
	if is_war: _button.grab_focus()

func _show_war(war: Dictionary, game: Dictionary) -> void:
	var attacker := _find(game.get("players", []), str(war.get("attackerLeaderId", "")))
	var defender := _find(game.get("players", []), str(war.get("defenderLeaderId", "")))
	_title.text = "GUERRA DECLARADA"
	_title.modulate = Color("edcb83")
	_subtitle.text = "%s  ×  %s\n%s" % [attacker.get("nation", "Atacante"), defender.get("nation", "Defensor"), CB_NAMES.get(str(war.get("casusBelli", "")), war.get("casusBelli", ""))]
	var attackers: Array = war.get("attackerIds", [])
	var defenders: Array = war.get("defenderIds", [])
	_comparison.text = "%s tropas visíveis · %s aliados convocados     VS     %s tropas visíveis · %s aliados convocados" % [_troops(game, attackers), maxi(0, attackers.size() - 1), _troops(game, defenders), maxi(0, defenders.size() - 1)]
	for child in _shields_root.get_children():
		_shields_root.remove_child(child)
		child.queue_free()
	var left := _shield(Color(str(attacker.get("color", "#3c729e"))))
	var right := _shield(Color(str(defender.get("color", "#b44d47"))))
	_shields_root.add_child(left)
	_shields_root.add_child(right)
	left.position = Vector3(-5.5, 0, 0)
	right.position = Vector3(5.5, 0, 0)
	left.rotation_degrees.y = 12
	right.rotation_degrees.y = -12
	var impact := create_tween().set_parallel(true)
	impact.tween_property(left, "position:x", -1.2, 0.6).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	impact.tween_property(right, "position:x", 1.2, 0.6).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	impact.chain().tween_property(left, "position:x", -1.6, 0.35)
	impact.parallel().tween_property(right, "position:x", 1.6, 0.35)

func _shield(color: Color) -> Node3D:
	var root := Node3D.new()
	var outline := PackedVector2Array([Vector2(-0.92, 1.1), Vector2(0.92, 1.1), Vector2(0.84, -0.25), Vector2(0.0, -1.2), Vector2(-0.84, -0.25)])
	var gold := StandardMaterial3D.new()
	gold.albedo_color = Color("cda45d")
	gold.metallic = 0.78
	gold.roughness = 0.27
	var face := StandardMaterial3D.new()
	face.albedo_color = color
	face.metallic = 0.35
	face.roughness = 0.38
	var backing := MeshInstance3D.new()
	backing.mesh = _extruded_shield(outline, 0.18)
	backing.material_override = gold
	root.add_child(backing)
	var center := MeshInstance3D.new()
	var inset := PackedVector2Array()
	for point in outline: inset.append(point * 0.89)
	center.mesh = _extruded_shield(inset, 0.20)
	center.material_override = face
	center.position.z = 0.06
	root.add_child(center)
	for dimensions in [Vector3(0.20, 1.65, 0.08), Vector3(1.3, 0.20, 0.08)]:
		var cross := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = dimensions
		cross.mesh = box
		cross.material_override = gold
		cross.position = Vector3(0, 0.18, 0.3)
		root.add_child(cross)
	return root

func _extruded_shield(points: PackedVector2Array, depth: float) -> ArrayMesh:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	var faces := Geometry2D.triangulate_polygon(points)
	for i in range(0, faces.size(), 3):
		for offset in [2, 1, 0]:
			var point := points[faces[i + offset]]
			surface.add_vertex(Vector3(point.x, point.y, depth))
		for offset in [0, 1, 2]:
			var point := points[faces[i + offset]]
			surface.add_vertex(Vector3(point.x, point.y, -depth))
	for i in range(points.size()):
		var a := points[i]
		var b := points[(i + 1) % points.size()]
		for vertex in [Vector3(a.x,a.y,depth), Vector3(b.x,b.y,depth), Vector3(a.x,a.y,-depth), Vector3(b.x,b.y,depth), Vector3(b.x,b.y,-depth), Vector3(a.x,a.y,-depth)]:
			surface.add_vertex(vertex)
	surface.generate_normals()
	return surface.commit()

func _finish() -> void:
	_timer.stop()
	_overlay.hide()
	_active = false
	_show_next()

func _find(items: Array, id: String) -> Dictionary:
	for item in items:
		if str(item.get("id", "")) == id: return item
	return {}

func _troops(game: Dictionary, owners: Array) -> int:
	var count := 0
	for army in game.get("battalions", []):
		if str(army.get("ownerId", "")) in owners:
			for key in ["infantry", "cavalry", "artillery", "warships", "transports"]: count += int(army.get(key, 0))
	return count

func _label(text: String, font_size: int) -> Label:
	var result := Label.new()
	result.text = text
	result.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	result.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	result.add_theme_font_size_override("font_size", font_size)
	return result
