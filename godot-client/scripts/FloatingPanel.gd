extends PanelContainer
## Embedded, independently movable/resizable HUD panel. Does not capture map input outside it.
var body: VBoxContainer
var title_label: Label
var _header: HBoxContainer
var _dragging := false
var _resizing := false
var _offset := Vector2.ZERO
var _start_size := Vector2.ZERO
var _start_mouse := Vector2.ZERO

func initialize(title: String, at: Vector2, dimensions: Vector2) -> void:
	position = at
	size = dimensions
	custom_minimum_size = Vector2(340, 230)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	add_child(column)
	_header = HBoxContainer.new()
	_header.custom_minimum_size.y = 40
	_header.mouse_default_cursor_shape = Control.CURSOR_MOVE
	_header.gui_input.connect(_header_input)
	column.add_child(_header)
	title_label = Label.new()
	title_label.text = title
	title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_header.add_child(title_label)
	var minimize := Button.new()
	minimize.text = "−"
	minimize.tooltip_text = "Minimizar / restaurar"
	minimize.pressed.connect(func():
		var scroll: ScrollContainer = body.get_parent()
		scroll.visible = not scroll.visible
	)
	_header.add_child(minimize)
	var close := Button.new()
	close.text = "×"
	close.tooltip_text = "Fechar esta janela"
	close.pressed.connect(hide)
	_header.add_child(close)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(scroll)
	body = VBoxContainer.new()
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 10)
	scroll.add_child(body)
	var grip := Label.new()
	grip.text = "◢"
	grip.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	grip.mouse_filter = Control.MOUSE_FILTER_STOP
	grip.mouse_default_cursor_shape = Control.CURSOR_FDIAGSIZE
	grip.gui_input.connect(_resize_input)
	column.add_child(grip)
	gui_input.connect(func(event: InputEvent):
		if event is InputEventMouseButton and event.pressed:
			move_to_front()
	)

func _header_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		_dragging = event.pressed
		_offset = get_global_mouse_position() - position
		move_to_front()
		accept_event()

func _resize_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		_resizing = event.pressed
		_start_mouse = get_global_mouse_position()
		_start_size = size
		move_to_front()
		accept_event()

func _input(event: InputEvent) -> void:
	if event is InputEventMouseButton and not event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		_dragging = false
		_resizing = false
	if event is InputEventMouseMotion and (_dragging or _resizing):
		var viewport_size := get_viewport_rect().size
		if _dragging:
			position = get_global_mouse_position() - _offset
			position.x = clampf(position.x, 0, maxf(0, viewport_size.x - size.x))
			position.y = clampf(position.y, 104, maxf(104, viewport_size.y - 60))
		else:
			size = (_start_size + get_global_mouse_position() - _start_mouse).max(custom_minimum_size)
			size.x = minf(size.x, viewport_size.x - position.x)
			size.y = minf(size.y, viewport_size.y - position.y)
		get_viewport().set_input_as_handled()
