import L from "leaflet";

export function emojiIcon(emoji: string, size = 28): L.DivIcon {
  return L.divIcon({
    html: `<div class="emoji-marker" style="font-size:${size}px;line-height:1">${emoji}</div>`,
    className: "emoji-marker-wrapper",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}
