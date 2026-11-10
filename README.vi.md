<div align="center">

# 3D-Graph

> *"Một vault có phân tầng không nên bị vẽ thành một cục rối."*

<img src="docs/images/layers-view.png" alt="Vault dưới dạng một tòa tháp các tầng: source, concept, model, strategy, person, framework, case-study, tag, other" width="720">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-1.4.0%2B-7c3aed)](https://obsidian.md)
[![Platform](https://img.shields.io/badge/Platform-Desktop%20only-lightgrey)](#cài-đặt)
[![Dependencies](https://img.shields.io/badge/Dependencies-none-brightgreen)](#cách-hoạt-động)

<br>

**3D-Graph là graph view 3D cho Obsidian, xếp một vault lớn thành các tầng.**

<sub>Plugin cá nhân. Giữ giao diện, tìm kiếm và color group của Graph view gốc, thêm camera 3D và Layers view. JavaScript thuần, không cần build, không phụ thuộc thư viện nào.</sub>

<br>

[English](README.md)

<br>

</div>

---

## Ví dụ

```
Bạn       ❯ Mở note "Binh pháp Tôn Tử" ở cửa sổ chính.

3D-Graph  ❯ Note có vòng tím ở tầng source.
            34 link của nó chuyển tím và đi xuyên qua các tầng khác,
            tới concept, framework, chương và tag.

            Mọi note liên kết đều có nhãn tên, nên bạn đọc được nó cung cấp
            cho những note nào mà không cần mở từng note.
```

```
Bạn       ❯ Graph đông quá. Chỉ cho tôi những gì quanh note này.

3D-Graph  ❯ Settings > Filters > Local depth: 2 hops. Phần còn lại của vault
            biến mất và graph được fit lại vào canvas.
```

Đây là các ví dụ minh họa. Các con số lấy từ vault của tác giả trong ảnh chụp (796 note, 187 tag, 4.529 link).

---

## Vấn đề: graph view hết giúp được khi vault vượt khoảng 1.000 note

Vault của tác giả là một knowledge graph có cấu trúc rõ ràng: `Concept → Model → Strategy → Execution`, cộng với Source, People, Framework và Case Study. Ở mức khoảng 800 note nó đã có 4.500 link, và vẫn đang tăng vượt 1.000. Ở quy mô này graph view không còn trả lời được câu hỏi duy nhất mà một vault có cấu trúc cần: **các note nối với nhau như thế nào giữa các tầng?**

1. **Graph view gốc quá cơ bản.** Nó là layout lực 2D phẳng. Hàng nghìn node và link co lại thành một cục rối. Color group và bộ lọc giúp bạn tìm một note, nhưng không giúp thấy cấu trúc: mọi note đều là cùng một loại chấm, không có chiều sâu, và một note source nằm chung một đám mây với concept mà nó cung cấp.
2. **Các graph view khác quá màu mè.** Ánh sáng, neon, hạt, bảng màu "thiên hà" chuyển động trông bắt mắt trong video demo, nhưng chúng thay màu bạn đã chọn bằng đồ trang trí, và tốn khung hình lẫn sự chú ý đúng lúc bạn đang làm việc. Màu sắc và vị trí không còn mang thông tin nữa.
3. **Chưa có graph nào tách note theo tầng.** Theo những gì tác giả tìm được, không graph view nào xếp note chồng lên nhau theo loại. Một vault có phân tầng vốn là một tòa tháp, nhưng mọi graph đều vẽ nó thành một đám mây, nên bạn không thấy được link đi từ source lên concept, model rồi tới strategy ra sao.

3D-Graph được viết để xử lý đúng vấn đề này: giữ nguyên sự điềm tĩnh và trung thành với Graph view gốc, chỉ thêm những gì một vault lớn, có phân tầng cần.

### 3D-Graph xử lý như thế nào

| Vấn đề khi vault trên 1.000 note | 3D-Graph làm gì |
|---|---|
| Cục rối phẳng, không có chỗ cho cấu trúc | **Camera 3D**: vault thành một vật thể gọn mà bạn xoay được. Nó tự quay chậm như địa cầu (cùng chiều kim đồng hồ, trục nghiêng) và dừng khi con trỏ nằm trên graph. |
| Không thấy được cấu trúc | **Layers view** xếp note thành các tầng của một tòa tháp theo thuộc tính `layer` hoặc `type` trong frontmatter. |
| Quá cơ bản, hoặc quá trang trí | **Giao diện giống Graph view gốc**: color group (kèm độ trong suốt) đọc từ `.obsidian/graph.json`, note không thuộc nhóm nào dùng `--graph-node`, link dùng `--graph-line`, tag màu xanh lá. Không ánh sáng, không hiệu ứng. |
| Khó thấy một note nằm ở đâu | Note đang mở ở bất kỳ cửa sổ nào có vòng tím. Các note liên kết với nó và link giữa chúng cũng chuyển tím, và mọi note liên kết đều có **nhãn tên** (nhãn được dời để không đè nhau). |
| Quá nhiều node cùng lúc | **Tìm kiếm** kiểu graph gốc (`path:`, `file:`, `tag:#x`, `["layer":concept]`, `-`, `OR`), **local graph** 1–3 bước, và công tắc cho tag và note mồ côi. |
| Graph lớn không bao giờ vừa màn hình | **Tự co giãn (auto-scale)**: graph được fit vào canvas (mặc định 97% nửa khung, chỉnh được), đo qua cả một vòng quay nên không bị cắt khi đang quay, và fit lại mỗi khi bạn chuyển 3D, Layers view hoặc 2D. |

### Hai cách nhìn cùng một vault

![Vault như một vật thể 3D, note đang mở và mọi note liên kết với nó màu tím](docs/images/3d-view.png)

*Không chia tầng: một vật thể gọn. Note "Binh pháp Tôn Tử" đang mở ở cửa sổ chính, nên nó và mọi note liên kết với nó màu tím và có nhãn. Phần còn lại của vault dùng đúng color group của bạn.*

Ảnh đầu tiên là cùng graph đó khi bật **Layers view**. Mỗi loại note có một tầng riêng (các đĩa nét đứt), từ `source` ở trên cùng đến `other` ở dưới cùng. Link từ note đang mở đi xuyên qua các tầng, nên bạn đọc được cấu trúc trong một cái nhìn: source nào cung cấp cho concept nào, model nào hình thức hóa chúng, và strategy nào dùng các model đó. Mỗi tầng rộng hơn khoảng 30% và khoảng cách giữa các tầng nhỏ hơn khoảng 10% so với layout cơ sở để tòa tháp gọn. Cả hai đều chỉnh được.

---

## Cài đặt

1. Tải `main.js`, `manifest.json` và `styles.css` từ [bản phát hành mới nhất](https://github.com/minhtranc1991/3d-graph-obsidian/releases/latest).
2. Đặt vào `<vault của bạn>/.obsidian/plugins/3d-graph/`.
3. Reload Obsidian và bật **3D-Graph** trong Settings, Community plugins.
4. Mở bằng icon ở ribbon (orbit) hoặc lệnh **Open 3D-Graph**.

Yêu cầu Obsidian 1.4.0 trở lên, chỉ chạy trên desktop.

### Sử dụng

Một icon răng cưa duy nhất ở góc phải trên. Bấm vào để hiện bốn nút:

| Nút | Tác dụng |
|---|---|
| Settings | Mở menu cài đặt (góc phải trên, mọi nhóm đều co lại). |
| Layers view | Bật hoặc tắt tòa tháp. |
| 3D view | Chuyển giữa 3D và 2D phẳng. |
| Reset | Đặt lại camera và fit lại graph. |

Kéo trên vùng trống để xoay, `Shift`+kéo hoặc kéo chuột phải để pan, lăn chuột để zoom, click note để mở (`Ctrl`/`Cmd`+click để mở tab mới). Click một tag để lọc graph theo tag đó.

---

## 3D-Graph hiển thị gì

Tầng của một note là thuộc tính `layer` nếu có, nếu không thì là `type`.

| Tầng | Note nằm ở đây | Quyết định bởi |
|---|---|---|
| source | Sách, bài báo, khóa học | `type: source` |
| concept | Concept | `layer: concept` |
| model | Model | `layer: model` |
| strategy | Strategy | `layer: strategy` |
| execution | Note thực thi | `layer: execution` |
| person | Con người | `type: person` |
| framework | Framework | `type: framework` |
| case-study | Case study | `type: case-study` |
| news | Tin tức | `type: news` |
| tag | Tag, là node xanh lá nối với các note của chúng | sinh ra từ tag của bạn |
| other | Mọi thứ còn lại, ví dụ note chương hoặc note bản đồ | không có `layer` hay `type` |

Chỉ những tầng có note mới hiện. Màu lấy từ color group của Graph view gốc, nên một concept trông giống nhau ở đây và ở đó.

### Giới hạn được nêu rõ

- Canvas và API Obsidian chỉ được giả lập trong test, nên plugin chưa được kiểm chứng với mọi theme.
- Tìm kiếm khớp theo tên, đường dẫn, tag và frontmatter, không tìm trong nội dung note.
- Chưa kéo được từng node.
- Phần so sánh với các graph view khác phản ánh quá trình tìm hiểu và trải nghiệm của tác giả, không phải một khảo sát đầy đủ.

---

## Demo vault

`demo-vault/` là một vault nhỏ sao chép từ vault của tác giả: **mỗi tầng một note**. Tầng tag gồm các tag mà những note đó mang.

| Tầng | Note demo |
|---|---|
| source | `Binh pháp Tôn Tử` |
| concept | `C - Information Asymmetry` |
| model | `M - Game Theory Model` |
| strategy | `S - Premortem` |
| person | `P - Charles Ponzi` |
| framework | `C - Thế bất khả chiến bại` |
| case-study | `CS - Cambridge Analytica` |
| other | `CH01 - Kế (Laying Plans)` |
| tag | 15 tag từ các note trên |

Các note là bản đã cắt gọn và link được nối lại để trỏ vào nhau. Nội dung bằng tiếng Việt như vault gốc. Cách mở:

1. Trong Obsidian chọn **Open folder as vault** và chọn thư mục `demo-vault`.
2. Chép `main.js`, `manifest.json` và `styles.css` vào `demo-vault/.obsidian/plugins/3d-graph/`.
3. Bật **3D-Graph**, mở bằng icon ở ribbon, rồi mở một note bất kỳ ở cửa sổ chính.
4. Bấm nút layers để thấy chín tầng.

`demo-vault/.obsidian/graph.json` mang color group của tác giả, nên demo trông giống các ảnh chụp.

---

## Cài đặt tùy chọn (Settings)

| Nhóm | Tùy chọn |
|---|---|
| Filters | Tìm kiếm, local depth, Tags, Orphans |
| Groups | Các color group đọc từ `graph.json`, Reload colors |
| Display | Cỡ và độ mờ node, mờ theo độ sâu, làm mờ note không liên quan, độ dày và độ mờ link, độ rộng link của note đang mở, cỡ nhãn, auto-fit fill |
| Spin | Bật/tắt, cùng chiều kim đồng hồ, tốc độ, độ nghiêng trục |
| Forces | Lực tâm, lực đẩy, lực link, khoảng cách link |
| Layers | Độ rộng trong một tầng, khoảng cách giữa các tầng |

---

## Cách hoạt động

1. Đọc mọi note, frontmatter, tag và link đã phân giải từ metadata cache của Obsidian.
2. Lọc bằng truy vấn kiểu graph gốc, giữ các note trong N bước quanh note đang mở ở chế độ local, rồi thêm node tag.
3. Xếp node bằng mô phỏng lực 3D có lưới giới hạn. Ở Layers view, mỗi note bị kéo về tầng của layer nó, và link chỉ tác dụng trong phạm vi một tầng để link xuyên tầng không kéo note rời khỏi tầng.
4. Chiếu bằng camera phần mềm (quay, độ nghiêng trục, thao tác kéo của bạn) và vẽ tất cả trong một lượt canvas: node gom theo màu và độ sâu, cạnh là một path, ma trận 3x3 được cache. Nếu vẽ chậm khi đang quay, plugin chỉ vẽ một tập cạnh cố định, và `fps` cùng thời gian vẽ hiện ở dòng trạng thái góc trái dưới.
5. Fit zoom vào canvas bằng cách đo độ lệch màn hình lớn nhất qua cả một vòng quay.

Sự kiện metadata chỉ dựng lại layout khi các note, link hoặc tầng đang hiển thị thật sự thay đổi.

## Cấu trúc repository

```
3d-graph-obsidian/
├── main.js           # plugin (JavaScript thuần, không cần build)
├── manifest.json
├── styles.css
├── versions.json
├── demo-vault/       # mỗi tầng một note + graph.json của tác giả
├── docs/images/      # ảnh chụp dùng trong README
├── test/smoke.cjs    # smoke test bằng jsdom
├── README.md
├── README.vi.md
└── LICENSE
```

## Đóng góp và phát triển

- Báo lỗi hoặc đề xuất cải tiến qua GitHub Issues.
- Chạy test bằng `npm install` rồi `npm test`. `test/smoke.cjs` nạp `main.js` với API Obsidian giả và DOM jsdom (không cần Obsidian), kiểm tra parser truy vấn, layout, xoay và nhập liệu, highlight note đang mở, tag, màu, menu cài đặt, chế độ 2D và giới hạn auto-fit.

## Giấy phép

MIT. Xem [LICENSE](LICENSE).

---

<div align="center">

**3D-Graph** cho thấy một vault có phân tầng nối với nhau ra sao, từng tầng một.

</div>
